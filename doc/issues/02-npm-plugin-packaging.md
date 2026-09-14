# 02. Упаковка плагина для распространения через npm

- **Дата:** 2026-09-14
- **Версия opencode:** 1.17.x / 1.18.x (исследование проведено по checkout `../opencode` 1.18.31)
- **Статус:** в плане

## Описание проблемы

Плагин (`semantic-lsp`) распространяется **ручным копированием** артефактов сборки:
`dist/semantic-lsp-plugin.js` копируется в `.opencode/plugins/`, `dist/symbol-finder.js` —
в `.opencode/tools/`, skill — в `.opencode/skills/` (см. README, раздел «Быстрый старт»).
При этом opencode нативно поддерживает npm-плагины:

- в `opencode.json` задаётся `"plugin": ["<pkg>", "<pkg>@<версия>", ["<pkg>", {opts}]]`
  (или команда `opencode plugin <pkg> [-g|-f]`, которая дописывает это поле сама);
- npm-пакет автоматически устанавливается (`@npmcli/arborist`) в
  `~/.cache/opencode/packages/<pkg>/node_modules/<pkg>` и загружается при старте;
- точка входа для server-плагина резолвится так: сначала `package.json: exports["./server"]`
  (`packages/opencode/src/plugin/shared.ts`, `resolvePackageEntrypoint`), затем fallback `main`.

Текущий `package.json` для публикации npm-плагина не приспособлен:

1. `main` указывает на `dist/index.js` — библиотеку, а не на модуль плагина; при npm-установке
   opencode загрузил бы не тот вход; `exports["./server"]` отсутствует;
2. нет параметра сборки, собирающего именно публикационный артефакт плагина (текущий `build`
   собирает всё: lib+cli+bundle+skill, и тащит в пакет лишнее);
3. нет `files` (состав tarball не controlled), `engines.opencode`, `repository`, `LICENSE`-файла,
   `CHANGELOG.md`; `author` пуст;
4. README описывает только ручную установку.

Исследование системы плагинов (важное для области публикации):

- форма модуля плагина — `export default { id, server(input) → Hooks }`; реализовано
  (`src/semantic-lsp-plugin.ts:253`, `id: "semantic-lsp"`), менять не нужно;
- **единственный манифест плагина — `package.json`**; id по умолчанию = имя пакета, но у нас id
  задан в модуле и от имени пакета не зависит;
- `engines.opencode` (semver) — единственный манифест-параметр, который opencode реально
  проверяет при npm-установке (для файловых плагинов — нет);
- версия плагина существует только в `package.json: version` (пин юзера `pkg@x.y.z`,
  трекинг в `~/.local/state/opencode/plugin-meta.json`); иных полей/файлов версии нет;
- skills в npm-V1 не подхватываются из пакета (только каталоги `.opencode/skills/**/SKILL.md`,
  глобальные директории и `opencode.json: skills.paths | skills.urls`) — в tarball не включается;
- standalone-tool `symbol-finder` и skill в основном функционале не участвуют: e2e-тесты
  `lsp-tool-definition.test.ts` и `semantic-lsp.test.ts` устанавливают в `.opencode/plugins/`
  единственный файл-бандл с обвязкой родного `lsp` tool — это и есть публикационный артефакт.

Публикация в public npm **не выполняется**: пакет будет выкладываться вручную во внутреннюю
систему (внутренний registry / загрузка tarball). Скрипты должны готовить `.tgz`, но не
публиковать его (никаких `prepublishOnly`/`prepack`-хуков публикации).

## Полный перечень артефактов publish-пакета

| Артефакт | Где хранится / задаётся | Статус |
|---|---|---|
| Модуль плагина (ESM-бандл, единственный рантайм-артефакт) | `exports["./server"]` → `dist/semantic-lsp-plugin.js` | бандл есть, маппинга нет |
| Типы `.d.ts` к бандлу | `dist/semantic-lsp-plugin.d.ts` (`tsc` их уже генерирует) | есть |
| id плагина | `export default { id: "semantic-lsp" }` в коде | есть |
| Версия (единственный источник) | `package.json: version` (bump через `npm version`) | есть |
| Совместимость с opencode | `package.json: engines.opencode` (`">=1.17"`) | нет |
| Состав tarball | `package.json: files` | нет |
| README (установка из внутреннего registry, активация lsp) | корень, попадает в tarball всегда | есть, не про npm |
| LICENSE | файл `LICENSE` в root (в package.json `ISC`, файла нет) | нет |
| CHANGELOG.md (принято, Keep a Changelog) | корень | нет |
| npm-метаданные `repository`, `author`, `keywords` (`opencode`, `opencode-plugin`) | `package.json` | частично/пусто |

Публикационный пакет **не содержит**: skill `go-to-definition`, standalone-бандл
`dist/symbol-finder.js`, библиотеку/CLI (кроме `.`-экспорта `exports`), `node_modules` (`zod`
бандлится esbuild). Иных артефактов опенкод для npm-плагинов не определяет (tui-плагины и
`oc-themes` — не наш случай).

## План доработки

1. **`package.json` — scripts:**
   - `build:plugin` — `tsc --emitDeclarationOnly && esbuild src/semantic-lsp-plugin.ts --bundle
     --outfile=dist/semantic-lsp-plugin.js --format=esm --platform=node --external:fs
     --external:path` (только публикационный бандл + его `.d.ts`, без skills/tools;
     `declaration: true`, `outDir: dist` в `tsconfig.json` уже заданы);
    - `clean` — `rm -rf dist`;
    - `pack:build` — `npm run clean && npm run typecheck && npm run build:plugin` — общая
      подготовительная сборка для обоих режимов упаковки;
    - `pack` — `npm run pack:build && npm pack` — `.tgz`-архив в корне репозитория (для выкладки
      во внутреннюю систему);
    - `pack:dir` — `npm run pack:build && npm pack --pack-destination=.pack-tmp && tar -xzf
      .pack-tmp/*.tgz -C .pack-tmp && rm -rf pkg/<pkg-name> && mkdir -p pkg && mv .pack-tmp/package
      pkg/<pkg-name> && rm -rf .pack-tmp` — второй режим «параметра» упаковки: вместо архива
      **разархивированная директория** `pkg/opencode-semantic-lsp/`, структурой идентичная tarball
      (состав формирует сам `npm pack` по полю `files`, ручное воспроизведение `files`-сементики
      не требуется) — удобно целиком скопировать в локальный репозиторий проекта-потребителя;
    - `.gitignore`: добавить `pkg/` и `.pack-tmp/` (выходные артефакты упаковки);
    - хуков публикации (`prepublishOnly`, `prepack`) **не добавлять**;
    - текущий `build` не менять (dev, e2e, ручная установка).
2. **`package.json` — поля публикации:**
   - `name`: `symbol-finder` → `opencode-semantic-lsp` (конвенция экосистемы `opencode-*`; имя
     свободно на npmjs; id плагина не меняется — задан в модуле); `version` — без изменений,
     единственный источник версии;
   - `exports`: добавить `"./server": { "import": "./dist/semantic-lsp-plugin.js",
     "types": "./dist/semantic-lsp-plugin.d.ts" }`, текущий `"."` сохранить;
   - `engines: { "opencode": ">=1.17" }` (поддерживаемая линейка с активированным lsp tool);
   - `files`: `["dist", "README.md", "LICENSE", "CHANGELOG.md", "!dist/skills"]`;
   - `repository`, `author`, `keywords` += `opencode`, `opencode-plugin`;
   - `dependencies`: убрать `zod` (входит в бандл esbuild), добавить в `devDependencies`.
3. **Новые файлы:**
   - `LICENSE` (ISC, текст npm-канонический) — правообладатель/год требуют подтверждения;
   - `CHANGELOG.md` — initial release 1.0.0, далее по формату Keep a Changelog.
4. **README:** новый раздел «Установка из npm» (`"plugin": ["opencode-semantic-lsp"]` вручную или
   `opencode plugin opencode-semantic-lsp`; пин версии `@x.y.z`; напоминание про активацию lsp:
   `OPENCODE_EXPERIMENTAL_LSP_TOOL=true` + `"lsp": true`), существующие инструкции ручного
   копирования перенести в подраздел «Локальная разработка».
5. **Проверка:** состав tarball (`tar -tzf` после `npm run pack`: `dist/` содержит только
   JS-бандл плагина и `.d.ts`, без `dist/skills/` и без lib/cli-рантаймов); содержимое
   `pkg/opencode-semantic-lsp/` после `npm run pack:dir` совпадает с tarball (`diff -r` против
   распакованного `.tgz`); установка собранного пакета в чистый проект спекой
   `"plugin": ["file:<tgz>"]` и валидация загрузки плагина (тот же файл, что проверяют e2e
   `lsp-tool-definition.test.ts`/`semantic-lsp.test.ts`); отдельно проверить, принимает ли
   opencode dir-спеку `"plugin": ["./pkg/opencode-semantic-lsp"]` (каталог) — если нет,
   зафиксировать в README, что из dir-режима копируется `dist/semantic-lsp-plugin.js`
   в `.opencode/plugins/`.

## Критерии приемки

1. `npm run pack` выполняется без ошибок, в `package/` внутри `.tgz`: только
   `package.json`, `README.md`, `LICENSE`, `CHANGELOG.md`, `dist/` без `dist/skills/`
   (`tar -tzf`); `npm run test` и `npm run test:e2e` (без `--clangd`) — зелёные, e2e не изменены.
2. `npm run pack:dir` выполняется без ошибок: в `pkg/opencode-semantic-lsp/` лежит
   разархивированный пакет, идентичный `.tgz` по составу (`diff -r` с распакованным архивом);
   `.pack-tmp/` удалён; `pkg/` и `.pack-tmp/` добавлены в `.gitignore`, `git status` после
   обоих режимов — без новых untracked-файлов; `.tgz` не остаётся в `pkg/`, директория
   не содержит `dist/skills/`.
3. `package.json` содержит: `name: "opencode-semantic-lsp"`, `exports["./server"]` →
   `./dist/semantic-lsp-plugin.js` (import) + `.d.ts` (types), `engines.opencode`, `files`,
   `repository`, `author`, keyword `opencode-plugin`; `zod` — в `devDependencies`;
   `prepublishOnly`/`prepack` — отсутствуют.
4. В чистом проекте с `opencode.json`: `"plugin": ["<внутреннее имя пакета>"]` (локальная
   проверка — `file:`-спека собранного tgz) — opencode загружает плагин (в логе плагин
   `semantic-lsp` активен), `tool.definition` подменяет схему `lsp` (проверка как в
   `lsp-tool-definition.test.ts`), без ручных `cp`.
5. README содержит инструкцию npm-установки с пиннингом версии и требованиями активации lsp,
   а также применение dir-режима (`npm run pack:dir` → копирование в `.opencode/plugins/` или
   dir-спекой — по результату проверки из п. 5 плана); раздел ручного копирования помечен как
   вариант для локальной разработки.
6. `CHANGELOG.md` и `LICENSE` присутствуют в репозитории и в tarball.

## Вне рамок задачи

- сама публикация/загрузка во внутреннюю систему (ручная, вне npm-скриптов);
- CI/automation сборки и публикации;
- регистрация пакета в публичном npm и добавление в экосистемный каталог opencode;
- распространение skill `go-to-definition` и standalone-инструмента через npm (в основной
  функционал не входят; доставляются как сейчас — для dev/тестов);
- tui-плагин (экспорт `exports["./tui"]`, темы `oc-themes`).
