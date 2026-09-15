# Semantic LSP Plugin для OpenCode

Плагин для [OpenCode](https://opencode.ai), который превращает встроенный `lsp` tool в семантически понятный для LLM интерфейс. Вместо указания точных координат (строка, колонка) модель передаёт имя символа и фрагмент кода, а плагин автоматически определяет позицию.

## Проблема

OpenCode предоставляет `lsp` tool для взаимодействия с LSP-серверами (goToDefinition, findReferences и др.), но требует точных координат символа — `line` и `character`. LLM регулярно ошибается при их определении, что приводит к неверным результатам.

## Решение

**Semantic LSP Plugin** перехватывает вызовы `lsp` tool через систему хуков OpenCode Plugin API:

1. **Подмена интерфейса** — убирает параметры `line`/`character`, добавляет `symbol`/`fragment`
2. **Определение координат** — читает файл, находит символ через алгоритм text-based matching, подставляет точные `line`/`character` в вызов
3. **Обогащение ответа** — добавляет предупреждения и ошибки, помогающие LLM скорректировать запрос

```
LLM вызывает lsp(filePath, operation, symbol, fragment)
        │
        ▼
   tool.definition       → подмена параметров
        │
        ▼
   tool.execute.before   → чтение файла → поиск символа → подстановка line/character
        │
        ▼
   Оригинальный lsp tool
        │
        ▼
   tool.execute.after    → обогащение ответа ошибками/предупреждениями
        │
        ▼
   Обогащённый ответ для LLM
```

## Поддерживаемые LSP-операции

| Операция | Описание |
|----------|----------|
| `goToDefinition` | Переход к определению символа |
| `findReferences` | Поиск всех ссылок на символ |
| `hover` | Документация и тип символа |
| `documentSymbol` | Все символы в документе |
| `workspaceSymbol` | Поиск символов по всей workspace |
| `goToImplementation` | Поиск реализаций интерфейса |
| `prepareCallHierarchy` | Иерархия вызовов в позиции |
| `incomingCalls` | Кто вызывает функцию |
| `outgoingCalls` | Кого вызывает функция |

## Установка

Плагин распространяется как npm-пакет `opencode-semantic-lsp` (внутренний registry: выгрузка
tarball-архива вручную, скриптов публикации в `package.json` нет). Рантайм-зависимостей пакет не
имеет — `zod` бандлится esbuild в `dist/semantic-lsp-plugin.js`.

### Из npm

Активируйте плагин в `opencode.json` проекта (или глобально в `~/.config/opencode/opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-semantic-lsp"]
}
```

Либо той же командой, которая ещё и допишет поле `plugin` и установит пакет:

```bash
opencode plugin opencode-semantic-lsp
```

Пин версии — стандартным синтаксисом npm:

```json
{ "plugin": ["opencode-semantic-lsp@1.0.0"] }
```

opencode установит пакет в `~/.cache/opencode/packages/<pkg>/node_modules/<pkg>` и загрузит точку
входа `exports["./server"]` (`dist/semantic-lsp-plugin.js`). id плагина (`semantic-lsp`) задаётся в
модуле и от имени пакета не зависит. Совместимость проверяется по `engines.opencode` (`>=1.17`).

### Активация lsp tool и LSP-серверов (opencode 1.17.x)

> **Независимо от способа установки** (npm / dir / ручное копирование) плагин подменяет только
> интерфейс `lsp` tool — сами LSP-серверы активирует opencode. Нужны **все** условия одновременно.

| Требование | Как выполнить |
|------------|----------------|
| Экспериментальный `lsp` tool | `OPENCODE_EXPERIMENTAL_LSP_TOOL=true` (или `OPENCODE_EXPERIMENTAL=true`) в окружении процесса opencode |
| Включённые LSP-серверы | `"lsp": true` **или** объект конфигурации LSP (например `"lsp": {"clangd": {...}}`) в `opencode.json` |
| Бинарь LSP-сервера | `typescript-language-server`, `clangd` и т.п.: opencode скачивает и кэширует их в `~/.cache/opencode`; если задан собственный `lsp.<id>.command`, бинарь обязан быть в `PATH` |
| Разрешение на tool | `"permission": { "lsp": "allow" }` |

`opencode.json` с полным набором требований:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-semantic-lsp"],
  "lsp": true,
  "permission": {
    "lsp": "allow"
  }
}
```

Важно:

- флага `OPENCODE_EXPERIMENTAL_LSP_TOOL=true` **недостаточно** — он включает сам tool, но не LSP-серверы;
- без ключа `lsp` opencode 1.17.x отключает все встроенные LSP-серверы (в логе — `all LSPs are disabled`), и любой вызов `lsp` завершается ошибкой `No LSP server available for this file type.`;
- проверка логов: при успешной активации присутствует запись `enabled LSP servers` с нужным `id` сервера.

### Локальная разработка

Для правки/отладки плагина можно собирать артефакты из исходников и подключать их без
переупаковки в npm-пакет.

#### Сборка из исходников

```bash
git clone <repo-url>
cd opencode-symbol-definition-finder
npm install
npm run build
```

Результат сборки:

- `dist/semantic-lsp-plugin.js` — бандл плагина (esbuild, ESM)
- `dist/symbol-finder.js` — Custom Tool для OpenCode (standalone)
- `dist/` — скомпилированные JS-файлы библиотеки (tsc)

#### Подключение ручным копированием

Создайте `.opencode/plugins/semantic-lsp-plugin.js` в корне проекта:

```bash
mkdir -p .opencode/plugins
cp dist/semantic-lsp-plugin.js .opencode/plugins/
```

Создайте `.opencode/package.json` с зависимостью от Plugin SDK:

```json
{
  "dependencies": {
    "@opencode-ai/plugin": "latest"
  }
}
```

Установите зависимости:

```bash
cd .opencode && npm install && cd ..
```

#### Публикационные артефакты (`npm run pack` / `npm run pack:dir`)

Обе команды сначала делают «чистую» подготовительную сборку (`clean` → `typecheck` →
`build:plugin` — только бандл плагина и его `.d.ts`, без skills и рантаймов lib/cli), а затем
упаковывают результат по полю `files`. Публикационных хуков (`prepublishOnly` / `prepack`) в
`package.json` нет намеренно: пакет выгружается вручную.

- `npm run pack` → `opencode-semantic-lsp-<version>.tgz` в корне репозитория — артефакт для
  выгрузки во внутреннюю систему;
- `npm run pack:dir` → `pkg/opencode-semantic-lsp/` — разархивированная директория, структурой
  идентичная tarball.

`.tgz`, `pkg/` и `.pack-tmp/` — выходные артефакты, они в `.gitignore`.

Дистрибутив контролируется тестами: быстрый integrity-сьют `npm test` проверяет собранный `pkg/opencode-semantic-lsp/` по метаданным и форме модуля, а plugin-e2e (`npm run test:e2e`) загружают этот же артефакт **как модуль** через dir-спеку `plugin` → `exports["./server"]` (подробнее — в разделе «Тесты»).

#### Dir-режим (`npm run pack:dir`)

Альтернатива npm-tarball'у для «переноса» собранного плагина между машинами/проектами: `npm run
pack:dir` готовит **разархивированную директорию** `pkg/opencode-semantic-lsp/` со структурой,
идентичной tarball (тот же `npm pack`, состав по `files`), без самого `.tgz` на выходе.

```bash
npm run pack:dir
# → pkg/opencode-semantic-lsp/ (package.json, README.md, LICENSE,
#                                CHANGELOG.md, dist/semantic-lsp-plugin.js + *.d.ts)
```

Подключить в проекте-потребителе — **два** рабочих варианта (оба проверены против opencode 1.18):

1. dir-спекой в `opencode.json` consumer'а: скопировать `pkg/opencode-semantic-lsp/` целиком в корень
   проекта-потребителя (получится `./pkg/opencode-semantic-lsp/` относительно корня consumer'а) и добавить
   в `opencode.json` consumer'а:

   ```json
   { "plugin": ["./pkg/opencode-semantic-lsp"] }
   ```

   Относительный путь резолвится **относительно корня проекта потребителя**, поэтому `pkg/` обязан
   лежать внутри него. Работает и абсолютный путь.

2. Ручным копированием: положить `pkg/opencode-semantic-lsp/dist/semantic-lsp-plugin.js` в
   `.opencode/plugins/` consumer'а (тот же файл, что и в npm-пакете) — см. подраздел выше.

## Параметры плагина

LLM передаёт параметры через `lsp` tool:

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `filePath` | string | Да | Путь к файлу |
| `operation` | string | Да | LSP-операция |
| `symbol` | string | Да | Имя символа (функция, переменная, класс) |
| `fragment` | string | Да | Фрагмент кода, содержащий символ (для дизамбигуации) |

## Архитектура проекта

```
src/
├── semantic-lsp-plugin.ts              # Plugin для OpenCode — основной продукт
├── semantic-lsp-transformer/           # Ядро алгоритма поиска символов
│   ├── SemanticLspTransformer.ts       # Основной класс с find() и bestEffort
│   ├── types.ts                        # Типы: FinderResult, FinderError, ...
│   ├── formatters/
│   │   ├── jsonFormatter.ts            # JSON-форматирование
│   │   ├── llmFormatter.ts             # Человекочитаемый формат для LLM
│   │   ├── lspFormatter.ts             # Структурированный формат для plugin
│   │   └── formatterFactory.ts         # Фабрика форматтеров
│   ├── search/
│   │   └── RegexSearchStrategy.ts      # Стратегия поиска на основе regex
│   ├── validation/
│   │   ├── ValidationChain.ts          # Цепочка валидаторов
│   │   ├── EmptyCodeValidator.ts       # ...
│   │   ├── EmptySymbolValidator.ts     # Валидаторы входных данных
│   │   ├── EmptyFragmentValidator.ts   # ...
│   │   ├── InvalidSymbolValidator.ts   # ...
│   │   └── SymbolInFragmentValidator.ts# ...
│   └── utils/
│       └── textNormalizer.ts           # Нормализация текста
├── opencode-tool.ts                    # Custom Tool (standalone symbol-finder)
├── cli.ts                              # CLI-утилита
├── index.ts                            # Публичный API библиотеки
├── infra/
│   ├── fileReader.ts                   # Интерфейс чтения файлов
│   └── nodeFileReader.ts               # Реализация через Node.js fs
└── skills/
    └── go-to-definition/SKILL.md       # Навык для OpenCode
```

## Дополнительные интерфейсы

> Не входят в публикационный tarball (см. «Публикационные артефакты»). Доступны только при работе с
> исходниками (`npm run build` — собирает lib/CLI без ограничений поля `files`).

### CLI

```bash
npx symbol-finder -f src/app.ts -s myFunction -F "myFunction(arg1, arg2)"
npx symbol-finder --file code.py --symbol MyClass --fragment "MyClass()" --format llm
npx symbol-finder -f main.go -s handler -F "handler(req)" --best-effort
```

`symbol-finder` — это значение `package.json: bin`, оно не меняется при переименовании пакета в
`opencode-semantic-lsp`: после установки пакета командой `npm i opencode-semantic-lsp` бинарь
всё равно будет доступен как `symbol-finder`.

### Библиотека

```ts
import { SemanticLspTransformer, LspFormatter } from "opencode-semantic-lsp";

const finder = new SemanticLspTransformer();
const result = finder.find({
  code: "const x = foo(1);\nfunction foo(n) { return n; }\nfoo(42);",
  symbol: "foo",
  fragment: "foo(42);",
});
```

Режим `bestEffort: true` всегда возвращает ровно одну позицию с fallback на `{line: 1, column: 1}` при невозможности найти символ.

### Custom Tool

`dist/symbol-finder.js` — standalone ESM-бандл, размещаемый в `.opencode/tools/`. Предоставляет прямой поиск символов без привязки к LSP.

## Тесты

```bash
npm test                                        # Unit + Integration + целостность пакета
npm run test:e2e                                # E2E без clangd (сюита semantic-lsp пропускается)
npm run test:e2e -- --clangd /path/to/clangd    # E2E целиком, включая clangd-сюиту
```

`npm test` дополнительно прогоняет быстрый **не-LLM сьют целостности публикационного пакета** (`tests/packaging/publish-integrity.test.ts`, офлайн): он собирает артефакт через `npm run pack:dir` и проверяет состав по `files`, резолв `exports["./server"]` на существующий файл внутри пакета, форму собранного модуля (`default{id, server}` + три хука `tool.definition`/`tool.execute.before`/`tool.execute.after`), самодостаточность бандла (только `fs`/`path`) и гейт `engines.opencode`. Для повторного прогона без пересборки — `SKIP_PACK_BUILD=1 npm test`.

Дистрибутив проверяется **загрузкой как модуль** (не ручным copy): plugin-e2e подключают плагин через `opencode.json: plugin: ["<ABS>/pkg/opencode-semantic-lsp"]` → `package.json: exports["./server"]` → `import()` собранного бандла (`tests/e2e/lsp-tool-definition.test.ts`, `semantic-lsp.test.ts`, `lsp-goto-definition.test.ts`). Временные consumer-проекты создаются внутри репозитория (`.e2e-tmp/`, чтобы opencode резолвил `node_modules`/`tsserver`), фикстуры не мутируются. Ручное копирование loose-файла сохранено ровно в одном smoke-тесте (`tests/e2e/plugins-dir-manual-copy.smoke.test.ts`).

E2E-тесты требуют `opencode` в `PATH` (или `OPENCODE_BIN=/path/to/opencode`) и активации `lsp` tool (см. выше).

Сюита `tests/e2e/semantic-lsp.test.ts` зависит от бинаря `clangd` и по умолчанию **пропускается** — прогон остаётся зелёным, а в конце выводится подсказка, как включить эти тесты. Путь к `clangd` задаётся только явно через `--clangd`: никакие поиски в `PATH` или кэше opencode не выполняются, пропустить сюиту «специальным флагом» нельзя — её просто не запускают.

Прогон запускается скриптом `tests/e2e/run-e2e.js` в три шага: `(1/3) distributable` (`npm run pack:dir` — публикационный артефакт `pkg/opencode-semantic-lsp/`), `(2/3) build dist` (`npm run build` — полный `dist/` для manual-copy smoke и tool-ассетов) и `(3/3) jest`. Порядок `pack:dir → build` обязателен: `pack:dir` чистит `dist/` и пересобирает только плагин, а `build` затем восстанавливает полный `dist/`, не трогая `pkg/`. Перед запуском jest проверяется наличие `pkg/opencode-semantic-lsp/dist/semantic-lsp-plugin.js`; в окружение jest пробрасывается `E2E_PACKAGE_DIR`. Ошибки делятся на два класса:

- **некорректный вызов** (`--clangd` без значения, повтор флага, значение `auto`) — баннер `E2E RUN ABORTED`, прерывание до сборки, ни один тест не запускается;
- **проблема с самим бинарём** (путь не найден, это не файл, `--version` не запускается, вывод не похож на clangd) — сразу печатается баннер `INVALID CLANGD PATH`, но прогон продолжается: сюиты, не зависящие от clangd, выполняются как обычно, а `semantic-lsp.test.ts` падает с той же диагностикой, и итоговый код прогона ненулевой.

Вывод сборки при успехе сворачивается в строку `build ... ok (1.6s)`: сообщения esbuild вида «Done in 30ms» иначе читаются как результаты тестов. Полный вывод сборки показывается только когда сборка упала.

Проверенный путь попадает в конфигурацию фикстуры как `lsp.clangd.command[0]`, поэтому `clangd` не обязан быть в `PATH` (важно для Windows).

## Технические требования

- Node.js
- TypeScript 6+
- LSP-сервер, настроенный для соответствующего языка проекта (clangd для C/C++, tsserver для TS/JS и т.д.)
- Для E2E: `OPCODE_EXPERIMENTAL_LSP_TOOL=true`, `"lsp": true` в конфигурации фикстуры; clangd-проверки — через `npm run test:e2e -- --clangd <path>`
