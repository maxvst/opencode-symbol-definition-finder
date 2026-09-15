# 03. Тестирование плагина как распространяемого npm-модуля

- **Дата:** 2026-09-14
- **Версия opencode:** 1.18.x (исследование проведено по checkout `../opencode` 1.18.31; бинарь в PATH — `1.18.31`)
- **Статус:** в плане

## Описание проблемы

Серия e2e-тестов подключает плагин **ручным копированием единственного файла**: `beforeAll`
делает `fs.copyFileSync(dist/semantic-lsp-plugin.js, .opencode/plugins/semantic-lsp-plugin.js)`
(см. `tests/e2e/semantic-lsp.test.ts:180`, `lsp-tool-definition.test.ts:85`,
`lsp-goto-definition.test.ts:148`). Такой путь проверяет сам JS-бандл, но **не проверяет
распространяемый npm-пакет как модуль**: он не задействует реальный механизм discovery/load
opencode и потому не даёт уверенности, что собранный и упакованный к распространению пакет
 (`npm run pack:dir` / `npm pack`) работает именно как полноценный плагин.

Что НЕ покрывается текущим ручным copy (по исходникам opencode 1.18.31):

- маппинг `package.json → exports["./server"]` (`plugin/shared.ts:103-114`,
  `resolvePackageEntrypoint`) — при битом/отсутствующем `./server` ручной copy продолжит работать,
  а установленный пакет — нет;
- гейт совместимости `engines.opencode` (`plugin/shared.ts:194-205`, `loader.ts:125-131`) — он
  применяется только для `source === "npm"`;
- состав tarball по полю `files` — опенкод грузит то, что реально попало в пакет;
- разрешение модуля-директории (каталог с `package.json`) как узлового модуля и страж
  «entry outside plugin directory» (`shared.ts:89-97, 175-192`).

Unit/integration-тесты (`tests/integration/semantic-lsp-plugin.test.ts`) импортируют TS-исходник
`src/semantic-lsp-plugin.ts` через ts-jest и также не трогают собранный бандл. Итого: нет ни
одного теста, который загружал бы **собранный артефакт публикации** маршрутом, который проходит
обычный пользователь.

### Реальные дистрибутивные пути opencode (исследование)

Discovery — `config/plugin.ts:18-30` (автоскан `{plugin,plugins}/*.{ts,js}`, только loose-файлы,
нереккурсивно) + поле `plugin` в конфиге (до 9 источников, `config/config.ts:344-368, 412-548`).
Load server-плагинов — `plugin/index.ts:186-242` → `plugin/loader.ts` → `plugin/shared.ts`.

| Спека в `opencode.json` | source | Маршрут | Покрытие |
|---|---|---|---|
| `"opencode-semantic-lsp"` (npm-имя) | npm | arborist install в `~/.cache/opencode/packages/…` (`npm.ts:115-137`) → `exports["./server"]` → `import()` | + гейт `engines`; требует registry |
| `"<abs>/pkg/opencode-semantic-lsp"` (dir) | file | `resolvePathPluginTarget`: каталог+`package.json` → node-resolution `exports["./server"]` → `import()` (оффлайн, без кэша) | проверки `exports`/импорта; гейт `engines` НЕ срабатывает; требуется экспорт `id` |
| `"file:/abs/….tgz"` (tarball) | npm | `isPathPluginSpec` = false → ветка npm (`shared.ts:207-213`), arborist распаковывает в глоб. кэш → `exports["./server"]` → `import()` | ≈ `opencode plugin <published>`; гейт `engines`; трогает `~/.cache` (нужна изоляция версии) |

Форма модуля-плагина: `readV1Plugin(...,"server","detect")` (`shared.ts:272-304`) принимает
`export default { id, server(input) → Hooks }`; для `source==="file"` экспорт `id` обязателен
(`resolvePluginId`, `shared.ts:306-323`). Наш бандл соответствует
(`src/semantic-lsp-plugin.ts:253-258`, `id: "semantic-lsp"`), самодостаточен (внешние импорты —
только `fs`/`path`; `zod` забандлен → грузится в чистом окружении без `node_modules` репозитория).

### Принятые решения по подходу

1. Основной дистрибутивный путь для e2e — **dir-спека** `plugin: ["<ABS>/pkg/opencode-semantic-lsp"]`,
   артефакт берётся строго из `npm run pack:dir` (структура == `npm pack`).
2. Поведенческие plugin-тесты **переводятся на модульную загрузку**; ручной copy остаётся ровно в
   одном smoke-тесте (для dev-пути loose-file).
3. Дополнительно — быстрый **не-LLM сьют целостности пакета** в `npm test` (без бинаря opencode и сети).
4. Custom-tool `symbol-finder` и skill `go-to-definition` — **вне скоупа** (не входят в npm-пакет:
   `pack` использует `build:plugin`, skills исключены полем `files`).

## План доработки

### 1. Новый быстрый не-LLM сьют целостности пакета (`npm test`)

Файлы `tests/packaging/publish-integrity.test.ts` (+ при необходимости `tests/packaging/helpers.ts`).
В `beforeAll` готовится артефакт: `npm run pack:dir` (`child_process`, ~180с; `SKIP_PACK_BUILD=1` —
пропуск подготовки с переиспользованием готового `pkg/`). Далее по **реально собранному**
`pkg/opencode-semantic-lsp/`:

1. **Состав публикационного списка** — `npm pack --dry-run --json` (read-only): включены
   `package/package.json`, `README.md`, `LICENSE`, `CHANGELOG.md`, `dist/semantic-lsp-plugin.js`;
   исключены `dist/skills/**` и рантайм tool/cli-бандлы (`dist/symbol-finder.js`).
2. **Резолв точки входа по правилам opencode** (`resolvePackageEntrypoint`): `exports["./server"].import
   === "./dist/semantic-lsp-plugin.js"`; резолв от корня пакета; файл существует и лежит ВНУТРИ корня
   (страж из `shared.ts:89-97`). Негатив на изолированно сконструированном `package.json`.
3. **Форма модуля** — dynamic `import()` собранного `dist/semantic-lsp-plugin.js`: `default` — объект,
   `default.id === "semantic-lsp"`, `typeof default.server === "function"`,
   `await default.server({ directory })` возвращает объект ровно с тремя функциями-хуками
   `tool.definition`, `tool.execute.before`, `tool.execute.after`.
4. **Самодостаточность** — множество импортов бандла (`from "…"`, `import "…"`, `require("…"`) ⊆ `{fs, path}`.
5. **Гейт `engines`** (его не покрывает dir-спека): `semver.satisfies(target, pkg.engines.opencode)`;
   `target` — из `"$OPENCODE_BIN" --version`, иначе константа-минимум `1.17.0`. Добавить `semver` в
   `devDependencies` (зафиксировать явно вместо транзитивной зависимости).

### 2. Рефакторинг e2e-обвязки (устранение 5× дублирования)

Новый `tests/e2e/helpers/`:

- `opencode.ts` — `runOpenCode(args, env)`, `parseJsonOutput(raw)`, `interface JsonEvent` (сейчас
  продублированы во всех четырёх e2e-тестах);
- `consumer.ts` — `makeConsumerProject({ pluginDirSpec, extraConfig })`: `fs.mkdtemp` → запись
  сгенерированного `opencode.json` (`"$schema"`, `plugin: ["<abs>"]`, `lsp: true`,
  `permission.lsp: "allow"`, опционально `tools: {...disable}`) → `git init/config/add/commit`
  (по образцу `semantic-lsp.test.ts:197-202`) → `{ dir, cleanup() }`.

Удалить `installOpencodeDeps` из всех e2e: самодостаточность бандлов подтверждена (п. 1.4), а opencode
сам доустанавливает `@opencode-ai/plugin` в config-директории (`config/config.ts:452-460`) — локальный
`.opencode/package.json` + `npm install` избыточны (экономия до 120с на сюиту).

### 3. Оркестрация `tests/e2e/run-e2e.js`

Расширить фазу сборки до двух шагов с текущим цветным выводом/обработкой ошибок:

- `[e2e] (1/3) distributable` → `npm run pack:dir`;
- `[e2e] (2/3) build dist` → `npm run build` (нужен для manual-copy smoke и tool-ассетов);
- `[e2e] (3/3) jest`.

Порядок **pack:dir → build обязателен**: `pack:dir` внутри делает `clean` (`rm -rf dist`) и пересобирает
только плагин; `build` после него восстанавливает полный `dist/` (`symbol-finder.js`, `skills`, бандл),
не трогая `pkg/`. Перед jest проверить существование
`pkg/opencode-semantic-lsp/dist/semantic-lsp-plugin.js` (иначе `abort`-баннер). Пробросить в окружение
jest `E2E_PACKAGE_DIR=<repo>/pkg/opencode-semantic-lsp` (helpers читают с фолбэком на этот путь).
Логика флага `--clangd` / `E2E_CLANGD_BIN` — без изменений.

### 4. Перевод plugin-тестов на модульную загрузку (dir-spec)

Все plugin-сюиты используют `makeConsumerProject` + `plugin: ["<E2E_PACKAGE_DIR>"]` вместо
`copyFileSync(... .opencode/plugins/)`:

- `tests/e2e/lsp-tool-definition.test.ts` — **главный behavioral-пробник «плагин загрузился как
  модуль»**: временный consumer с dir-спекой; дешёвый промпт «перечисли параметры tool `lsp`»;
  ассерты: есть `fragment` и `symbol`, нет `line`/`character`. clangd не нужен. Доказывает полный
  маршрут: discovery через `plugin` + `exports["./server"]` → импорт собранного бандла → принятие
  `default{id,server}` → регистрация `tool.definition`.
- `tests/e2e/semantic-lsp.test.ts` (clangd) — consumer с `lsp.clangd.command`; ассерты текущие
  (`goToDefinition` → `c.cpp`, текст содержит `42`); гейт `describe.skip` без clangd сохраняется.
  Подтверждает работу всех трёх хуков в живом логине.
- `tests/e2e/lsp-goto-definition.test.ts` — временный consumer: ассеты `symbol-finder.js` (tool) и
  `SKILL.md` (skill) кладутся вручную в temp-директорию фикстуры (они вне npm-пакета), сам плагин
  подключается dir-спекой; прочие ассерты сохраняются.
- `tests/e2e/opencode-tool.test.ts` — **без изменений** (placement custom-tool файла; вне scope).

### 5. Ручной copy → ровно 1 smoke

- Удалить из git закоммиченный устаревший
  `tests/e2e/fixtures/lsp-project/.opencode/plugins/semantic-lsp-plugin.js` (перезаписывался в
  `beforeAll`, более не нужен).
- Новый `tests/e2e/plugins-dir-manual-copy.smoke.test.ts`: копирует `dist/semantic-lsp-plugin.js` во
  временный consumer `.opencode/plugins/` и делает тот же дешёвый lsp-параметры промпт — сохраняет
  покрытие dev-пути loose-file. Единственный тест с ручным copy.

### 6. Прочее

- `.gitignore` уже покрывает `pkg/`, `.pack-tmp/`, `*.tgz` — без изменений.
- jest-конфиги: `jest.config.js` автоматически подхватит `tests/packaging/**` (вне `tests/e2e`);
  e2e — новые/переименованные файлы по `**/*.test.ts`. Правки конфигов не требуются.
- README (§Тесты, §Публикационные артефакты): примечание, что дистрибутив проверяется загрузкой как
  модуль (dir-spec) + integrity-сьютом.

### 7. Порядок применения

1. `helpers/` + `semver` в devDep. 2. `tests/packaging/*` (red→green, `npm test`). 3. `run-e2e`
build-phases + `E2E_PACKAGE_DIR`. 4. Перевод plugin-сюит на consumer+dir-spec. 5. Smoke manual-copy +
удаление stale-файла. 6. README. Прогон после каждого шага.

## Критерии приемки

**Integrity (всегда, `npm test`, оффлайн, без LLM).** Сьют зелёный и подтверждены все 5 утверждений
п. 1 плана: состав tarball по `files`; корректный резолв `exports["./server"]` на существующий файл
внутри пакета; форма `default{id,server}` + три хука собранного бандла; самодостаточность (только
`fs`/`path`); совместимость `engines.opencode`. При порче любого из (`exports["./server"]`, `default`,
`id`, появлении внешнего импорта, выходе `engines` за target-версию) сьют обязан упасть.

**E2E «как полноценный плагин» (`npm run test:e2e`, опционально `-- --clangd <path>`).**

1. `lsp-tool-definition` (dir-spec): opencode загружает плагин ИСКЛЮЧИТЕЛЬНО через `config.plugin` +
   `package.json.exports["./server"]` (файла в `.opencode/plugins/` нет) и `tool.definition` реально
   меняет определение `lsp` (присутствуют `fragment`/`symbol`, отсутствуют `line`/`character`).
2. `semantic-lsp` (dir-spec + clangd): полный `goToDefinition` через модульно подключённый плагин
   возвращает `c.cpp`, ответ содержит `42` (работают `tool.definition`+`before`+`after`); подтверждается
   только при валидном `--clangd`, иначе сюита пропускается (не «падает красным»).
3. `lsp-goto-definition`: связка «модуль-плагин + вручную положенные tool/skill» даёт `symbol-finder`
   → `STATUS: FOUND`, `lsp goToDefinition` → `math.ts`, ни один forbidden-инструмент не использован.
4. `opencode-tool` и `plugins-dir-manual-copy.smoke` проходят как раньше.

**Портативность/производительность.** Все plugin-e2e собираются и проходят на ВРЕМЕННОЙ
consumer-директории (не мутируя фикстуры в репо); артефакт берётся из `pkg/opencode-semantic-lsp/`,
структурно идентичного `npm pack`; из e2e убран лишний `npm install` фикстур; при сбое `pack`/`build`
прогон прерывается баннером до запуска jest.

**Гарантия соответствия дистрибутива.** Ни один plugin-behavioral-e2e больше не проверяет отдельно
подсунутый `.js`-файл; уверенность «работает как полноценный плагин» даёт тест над артефактом,
собранным командой `npm run pack:dir` (= содержимому `npm pack`).

## Вне рамок задачи

- npm-имя `plugin: ["opencode-semantic-lsp"]` через публичный реестр (не опубликован; опциональный
  второй слой через verdaccio/tarball `file:`-спеку со стресс-тестом глобального кэша — по решению,
  отложен до явного запроса);
- распространение и модульное тестирование custom-tool `symbol-finder` и skill `go-to-definition`
  (не часть npm-пакета; доставляются вручную, тесты opencode-fич остаются как есть);
- tui-плагин (`exports["./tui"]`, `oc-themes`);
- CI/автоматизация сборки и публикации.
