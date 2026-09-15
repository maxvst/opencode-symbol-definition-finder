# 04. Состав npm-пакета: whitelist вместо чёрного списка

- **Дата:** 2026-09-15
- **Версия opencode:** не существенна (задача про упаковку; контекст e2e — бинарь `1.18.31` в PATH)
- **Статус:** реализовано 2026-09-15

## Описание проблемы

Состав публикационного tarball сейчас задан чёрным списком:
`package.json: files = ["dist", "README.md", "LICENSE", "CHANGELOG.md", "!dist/skills"]`.
Защищён от попадания в пакет только skill, всё остальное — «как получится». Проверено `npm pack --dry-run`
на working-копии 2026-09-15:

1. **Грязный dist протекает в публикацию.** Легитимный путь `npm run pack` (`pack:build` = `clean` +
   `build:plugin`) кладёт в `dist/` только бандл плагина и `.d.ts`. Но после полного `npm run build`
   прямой `npm pack` упаковывает **весь** `dist/`: 105 файлов, включая standalone-бандл
   `dist/symbol-finder.js` (533 КБ), `cli.js`, `index.js`, `opencode-tool.js`, рантаймы
   `semantic-lsp-transformer` и все `*.map`. Критерий issue 02 («в tarball только JS-бандл плагина и
   `.d.ts`») фактически нарушается; состав пакета зависит от того, какая сборка запускалась последней.
2. **Висячие входные точки.** В штатном publish-артефакте (`pack:build`) поля `main: dist/index.js`,
   `bin: symbol-finder → dist/cli.js` и `exports["."]` ссылаются на файлы, которых в пакете нет
   (лежат только соответствующие `.d.ts`). Пакет заявляет себя библиотекой и CLI, но быть ими не может;
   работает только как opencode-плагин через `exports["./server"]`. Принятое решение: пакет — **только**
   opencode-плагин, `main`/`bin`/`types`/`exports["."]` из `package.json` удалить.
3. **Map-файлы в пакете.** `tsconfig.json` включает `sourceMap`/`declarationMap`, в tarball попадают
   `*.js.map`/`*.d.ts.map` — лишний вес, отношения к артефакту не имеют.
4. **Тест не ловит рассинхрон состава.** `tests/packaging/publish-integrity.test.ts:113-124` отсутствие
   `cli.js`/`symbol-finder.js` проверяет по `PKG_DIR` (результат `pack:dir`, всегда чистый), а dry-run
   фильтрует только по `dist/skills/`. Сценарий «полный build + npm pack» проходит тест незамеченным.
   Кроме того, проверка построена на перечислении запрещённого: будущие артефакты иных видов
   (commands, themes и т. п.) не запрещены и молча попадут в пакет.

## Что должно попасть в пакет (whitelist)

Принцип: пакет содержит **весь функционал обёртки вокруг lsp tool** и ничего более — ровно то, что
тестируется e2e (из пакета e2e используют только `dist/semantic-lsp-plugin.js`,
`tests/e2e/helpers/paths.ts:23`). Esbuild инлайнит в бандл весь `semantic-lsp-transformer` и `zod`;
внешние импорты — только `fs`/`path` (самодостаточность подтверждена integrity-сьютем).

| Путь | Назначение |
|---|---|
| `dist/semantic-lsp-plugin.js` | единственный рантайм-артефакт, `exports["./server"]` |
| `dist/semantic-lsp-plugin.d.ts` | типы к бандлу (`types` у `exports["./server"]`) |
| `README.md`, `LICENSE`, `CHANGELOG.md` | документация (npm добавляет их безусловно; перечислены для манифестности) |
| `package.json` | всегда включается npm |

Не попадает ничего, кроме перечисленного: skills (`src/skills` → `dist/skills`), `dist/symbol-finder.js`,
`cli.js`/`index.js`/`opencode-tool.js`/transformer-рантаймы, `*.map`, любые будущие commands/themes.

## План доработки

### 1. `package.json`

- `files` → точный whitelist:
  `["dist/semantic-lsp-plugin.js", "dist/semantic-lsp-plugin.d.ts", "README.md", "LICENSE", "CHANGELOG.md"]`;
  исключение `!dist/skills` убрать (whitelist покрывает);
- удалить `main`, top-level `types`, `bin` (`symbol-finder`), `exports["."]`; в `exports` остаётся только
  `"./server"` (`import` + `types`). CLI и библиотека из публикуемого пакета уходят (решение см. п. 2
  «Описания проблемы»);
- `scripts` не менять: `build` — dev/e2e/ручная установка (копирует skills в `dist` — не мешает whitelist),
  `start` (`node dist/cli.js`) — локальная работа в репозитории;
- `engines`, `repository`, `keywords`, `author` — без изменений.

### 2. `tests/packaging/publish-integrity.test.ts` — строгое равенство множеств

- новый тест «packages exactly the allow-list and nothing else»: результат `publishablePaths()`
  (`npm pack --dry-run --json`, уже есть в файле) после `sort()` должен быть `toEqual` эталонному
  массиву:

  ```ts
  const ALLOWED = [
    "CHANGELOG.md",
    "LICENSE",
    "README.md",
    "package.json",
    "dist/semantic-lsp-plugin.js",
    "dist/semantic-lsp-plugin.d.ts",
  ];
  ```

- проверка — именно **равенство множеств**, а не «запрещённые пути отсутствуют»: любой артефакт вне
  списка (`SKILL.md`, `symbol-finder.js`, `cli.js`, `*.map`, будущие `commands/` и т. п.) роняет тест сам,
  без ведения blacklist; недостающий обязательный файл роняет тем же утверждением;
- существующий тест «excludes skills and runtime tool/cli bundles» (строки 113-124) с таким равенством
  избыточен (состав `pack:dir` тождествен составу dry-run) — удалить;
- тест выполняется на текущем (возможно «грязном») `dist` — регресс-сценарий `npm run build` + `npm pack`
  покрыт автоматически.

### 3. README

- разделы «CLI» и «Библиотека» (строки ~253, ~265): убрать рекламу из публикуемого пакета —
  `npx symbol-finder` и `import { ... } from "opencode-semantic-lsp"` после установки из реестра работать
  не будут. Переформулировать: CLI и библиотека — часть исходного репозитория, использование из исходников
  (`npm run build` → `node dist/cli.js`; импорт из локального `dist/`);
- §Публикационные артефакты (строки ~166-184): перечисление состава уже соответствует whitelist —
  сверить, чтобы нигде не осталось утверждений про bin/библиотеку в составе пакета.

### 4. Устаревшие артефакты

- висячие в корне `opencode-semantic-lsp-1.0.0.tgz` и `pkg/opencode-semantic-lsp/` (gitignore'нутые, от
  старого состава) — после изменений перегенерировать `npm run pack` / `npm run pack:dir`.

### 5. Порядок применения

1. `package.json` (files + удаление main/bin/types/exports["."]). 2. Integrity-сьют (красный на текущем
   составе → зелёный). 3. README. 4. Перегенерация артефактов. Прогон после каждого шага.

## Критерии приемки

1. `package.json`: `files` — whitelist из пяти путей без `!dist/skills`; `main`, top-level `types`, `bin`,
   `exports["."]` отсутствуют; `exports["./server"]` указывает на `./dist/semantic-lsp-plugin.js` (+ `types`).
2. `npm pack --dry-run` даёт **ровно** `{package.json, README.md, LICENSE, CHANGELOG.md,
   dist/semantic-lsp-plugin.js, dist/semantic-lsp-plugin.d.ts}` в обоих сценариях: после `pack:build` и
   после полного `npm run build` на грязном `dist`. SKILL.md, `symbol-finder.js`, `cli.js`, `index.js`,
   любые `*.map` и любые иные файлы попасть в пакет невозможно.
3. Integrity-сьют зелёный; тест строгого равенства состава присутствует и падает на любом расхождении
   состава (проверить мутацией: временно добавить файл в `files`/dist — тест обязан покраснеть).
4. `npm test` и `npm run test:e2e` — зелёные; e2e не изменены (dir-spec резолвит `exports["./server"]`,
   файл в составе есть).
5. README не обещает `npx symbol-finder`/импорт библиотеки из установленного пакета; описание состава
   публикационного артефакта соответствует факту (`tar -tzf`: 6 файлов).

## Вне рамок задачи

- распространение skill `go-to-definition` и custom tool `symbol-finder` через npm (как в issues 02/03 —
  доставляются вручную для dev/e2e);
- публикация библиотеки/CLI отдельным пакетом — не заводится;
- sourcemaps публикуемого бандла (отладка по исходникам из реестра);
- сама публикация во внутренний registry, CI/автоматизация сборки.
