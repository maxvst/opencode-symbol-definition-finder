# 01. Сломались e2e-тесты LSP-плагина после обновления opencode

- **Дата:** 2026-09-13
- **Версия opencode:** 1.17.13 (до обновления тесты прогонялись на ~1.17.8)
- **Статус:** реализовано 2026-09-13
- **Затронутые тесты:** `tests/e2e/lsp-goto-definition.test.ts`, `tests/e2e/semantic-lsp.test.ts`

## Описание проблемы

После обновления opencode (бинарь `~/.opencode/bin/opencode`, версия 1.17.13) перестали
проходить e2e-тесты связки «плагин semantic-lsp + lsp tool». По результатам прогонов
2026-09-13 (логи `~/.local/share/opencode/log/opencode.log`, БД сессий `opencode.db`):

| Тест | Результат | Симптом |
|------|-----------|---------|
| `opencode-tool.test.ts` | PASS | custom tool `symbol-finder` отработал корректно |
| `lsp-tool-definition.test.ts` | PASS | плагин загрузился, `tool.definition` вернул `operation, filePath, symbol, fragment` |
| `lsp-goto-definition.test.ts` | FAIL | `lsp goToDefinition` → `No LSP server available for this file type.`; warmup зациклился на `SchemaError: Missing key ["line"]`; модель использовала запрещённый tool `read` и пропустила `symbol-finder` |
| `semantic-lsp.test.ts` | FAIL | первый `goToDefinition` → `No results found`, далее `No LSP server available...`; модель пыталась установить clangd через `apt-get` (неудачно, нет root) |

Важно: **API плагинов в 1.17.13 совместим** с текущей реализацией плагина. Проверено:

- диффами исходников `../opencode` (checkout 1.17.8) против тега `v1.17.13`: `plugin/loader.ts`,
  `plugin/shared.ts` (`readV1Plugin`), `tool/registry.ts` (триггер `tool.definition`,
  `output.jsonSchema`), `session/tools.ts` (`tool.execute.before/after` с `callID`),
  `tool/lsp.ts`, `lsp/server.ts`, `lsp/lsp.ts`, формат плагина `{ id, server }`, загрузка
  `.opencode/plugins/*` и `.opencode/tools/*`, флаг `OPENCODE_EXPERIMENTAL_LSP_TOOL` —
  функционально идентичны;
- фактическими прогонами 2026-09-13: плагин загружается, `tool.definition` подменяет
  параметры `lsp` на `operation/filePath/symbol/fragment`, `tool.execute.before`
  переписывает `symbol/fragment` → `line/character`, `OPENCODE_EXPERIMENTAL_LSP_TOOL=true`
  доходит через `script`.

## Причины возникновения

1. **Не выполняются условия активации LSP в фикстуре `lsp-project` (главная причина TS-тестов).**
   В `tests/e2e/fixtures/lsp-project/opencode.json` отсутствует ключ `lsp`. В opencode 1.17.x
   без `"lsp": true` (или объекта конфигурации LSP) **все встроенные LSP-серверы отключаются**
   — в логах: `message="all LSPs are disabled"`. В результате `lsp` tool бросает
   `No LSP server available for this file type.` Переменной `OPENCODE_EXPERIMENTAL_LSP_TOOL=true`
   недостаточно — она лишь включает сам tool, а не LSP-серверы.

2. **Отсутствует бинарь `clangd` на машине (причина падения C++-теста).**
   `which clangd` пуст, установка через apt невозможна (нет root). Конфиг C++-фикстуры
   (`lsp.clangd.command: ["clangd", ...]`) срабатывает, но spawn clangd падает: первый вызов
   завершается `No results found for goToDefinition` (сервер помечается `broken`),
   последующие — `No LSP server available for this file type.`

3. **Реальный баг плагина: хук `tool.execute.before` неустойчив к пустым `symbol`/`fragment`.**
   При вызовах `lsp` с `symbol: ""` / `fragment: ""` (так модель отвечает на warmup-промпт, т.к.
   в схеме плагина нет `line`/`character`) хук выходит по `if (!args.symbol || !args.fragment) return`
   и аргументы не переписываются. Исходная схема `lsp` tool требует `line` → модель получает
   `SchemaError(Missing key ["line"])` и зацикливается, не имея возможности исправить ввод
   (в её схеме `line` отсутствует). Кроме того, хук игнорирует «сырые» числовые `line`/`character`,
   если модель передала их вместе с `symbol`/`fragment`.

4. **Флигкость `lsp-goto-definition`:** модель иногда пропускает `symbol-finder` и использует
   запрещённые инструменты (`read`), что ломает проверки FORBIDDEN_TOOLS. В фикстуре нет запрета
   на эти инструменты на уровне конфига; сама проверка реализована циклом отдельных `expect`
   и при падении показывает только первое нарушение.

5. **Нестабильность провайдера модели:** иногда сессия завершается без финального текста
   ассистента — проверка «ответ содержит `math.ts`» падает с невнятной ошибкой, которую легко
   спутать с поломкой плагина.

## План по исправлению

1. **`tests/e2e/fixtures/lsp-project/opencode.json`**
   - добавить `"lsp": true` — активировать встроенные LSP-серверы (typescript);
   - добавить `"tools": {"grep": false, "glob": false, "read": false, "bash": false,
     "webfetch": false, "websearch": false, "edit": false, "write": false, "list": false,
     "codesearch": false}` — маппится в permission-deny, делает FORBIDDEN-проверки
     детерминированными (список повторяет `FORBIDDEN_TOOLS` теста); `permission: {lsp: "allow"}`
     уже есть.

2. **`src/semantic-lsp-plugin.ts`** — хук `tool.execute.before`:
   - трогать вызов только при валидном объекте `output.args` (иначе leave-alone);
   - ранний выход только при отсутствии `filePath`: пустые строки и whitespace-only
     `symbol`/`fragment` больше не повод пропускать переписывание — finder вызывается
     с пустой строкой, `symbol`/`fragment` удаляются из аргументов в любом случае;
   - позиция: найденный без ошибок match задаёт `line`/`character`, перекрывая любые
     «сырые» значения модели; если ничего не найдено — сохраняются переданные числовые
     `line`/`character`, а при их отсутствии проставляется 1:1. Такой хук всегда оставляет
     аргументы удовлетворяющими исходной схеме `lsp` tool, поэтому `SchemaError(Missing key ["line"])`
     с безысходной для модели ошибкой больше невозможен;
   - unit-тесты в `tests/semantic-lsp-plugin.test.ts`: пустые строки `symbol`/`fragment`;
     whitespace-only `symbol`/`fragment`; перекрытие «сырых» `line`/`character` найденным match;
     сохранение «сырых» `line`/`character` при отсутствии результата; отсутствие `args`.

3. **`tests/e2e/lsp-goto-definition.test.ts`**
   - привести промпт `warmUpLsp` к семантическому API плагина
     (`operation documentSymbol, filePath src/main.ts, symbol calculateSum, fragment const total = calculateSum(5, 10)`)
     вместо `line/character`; warmup остаётся best-effort (всегда resolve), но становится валидным вызовом;
   - в `beforeAll` дополнительно устанавливать свежесобранный бандл плагина
     (`dist/semantic-lsp-plugin.js`) в `.opencode/plugins/` фикстуры — входящая в фикстуру копия
     рассинхронизирована со сборкой (коммитнутая копия тоже обновлена);
   - FORBIDDEN_TOOLS: вместо цикла `expect` собирать `usedForbidden` и проверять
     `expect(usedForbidden).toEqual([])` — одна ошибка со всем списком нарушений;
   - детектировать flake провайдера: если сессия завершилась без единого текстового ответа
     ассистента — падать с явным сообщением «provider/model flake, re-run» и списком
     использованных tools, а не с невнятной contains-ошибкой.

4. **Обработка отсутствия clangd: clangd-тесты опциональны и включаются явным путём, прогон без clangd остаётся зелёным.**
   - новый обёрточный скрипт запуска e2e `tests/e2e/run-e2e.js`: парсит `--clangd <path|=`-форму из argv
     (`npm run test:e2e -- --clangd /path/to/clangd`), остальные аргументы пробрасывает в jest как есть;
     сборка выполняется внутри скрипта шагом `(1/2)` (её успешный вывод сворачивается в строку
     `build ... ok (1.6s)` — сообщения esbuild вида «Done in 30ms» иначе читаются как результаты тестов;
     полный вывод показывается только при падении сборки), jest запускается шагом `(2/2)` напрямую через
     `node`; путь передаётся через env `E2E_CLANGD_BIN` (без флага переменная удаляется из окружения);
     `package.json`: `test:e2e` → `node tests/e2e/run-e2e.js`;
   - два раздельных класса ошибок `--clangd`:
     - **некорректный вызов** (`--clangd` без значения, повторяющийся флаг, значение `auto`) — баннер
       `E2E RUN ABORTED`, прерывание до сборки, ни один тест не запускается;
     - **проблема с самим бинарём** (путь не найден, это не файл, `--version` не запускается, вывод
       не похож на clangd) — баннер `INVALID CLANGD PATH` печатается до сборки, но прогон продолжается:
       clangd-независящие сюиты выполняются как обычно, `semantic-lsp.test.ts` падает с той же
       диагностикой, итоговый код прогона ненулевой;
   - `tests/e2e/semantic-lsp.test.ts`:
     - `E2E_CLANGD_BIN` не задан → весь suite пропускается (`describe.skip`), прогон зелёный,
       подсказка о включении clangd-тестов печатается в начале (`NOTE`) и в конце (`RESULT`) прогона;
     - путь задан → suite запускается, бинарь дополнительно проверяется в `beforeAll`
       (`--version` должен запускаться и вернуть строку версии, содержащую `clangd`), а путь
       подставляется в `lsp.clangd.command[0]` конфигурации фикстуры — clangd не обязан быть в `PATH`
       (важно для Windows);
     - исправлены проверки результата: статус `completed` требуется у событий `goToDefinition`
       (а не у всех lsp-вызовов) и минимум один completed-вызов обязателен;
   - поиск `clangd` в `PATH`/`which`/кэше opencode сознательно **не** выполняется: указанный пользователем
     путь валидируется до jest и исключает и ложное «clangd отсутствует» (opencode резолвит бинарь шире,
     чем `which()`: собственный кэш `~/.cache/opencode/bin/clangd`, автозагрузка релиза), и платформенные
     различия `PATH`-поиска на Windows; специальный флаг пропуска тоже не нужен — если `--clangd`
     не передан, clangd-сюита просто не запускается. Отсутствие clangd — нормальный (default) режим,
     а не поломка прогона.

5. **Документация (README):** зафиксировать требования активации LSP-инструмента в opencode 1.17.x:
   - новый раздел «Активация lsp tool и LSP-серверов (opencode 1.17.x)» — таблица требований
     (`OPENCODE_EXPERIMENTAL_LSP_TOOL=true` или `OPENCODE_EXPERIMENTAL=true`; `"lsp": true` или объект
     конфигурации LSP в `opencode.json` — без него встроенные серверы отключены; бинари LSP-серверов —
     кэш opencode `~/.cache/opencode`, собственный `lsp.<id>.command[0]` — `PATH`;
     `permission: {lsp: "allow"}`), корректный пример `opencode.json` и способ проверить активацию
     по логам (`enabled LSP servers`);
   - обновлён раздел «Тесты»: команды прогона с `--clangd` и без, поведение `run-e2e.js`
     (пропуск clangd-сюиты по умолчанию, два класса ошибок, сворачиваемый вывод сборки);
   - «Технические требования» дополнены требованиями для e2e.

## Критерии успешности

1. `npm run test` (typecheck + unit-тесты) — зелёные, включая пять новых кейсов хука
   `tool.execute.before`: пустые строки `symbol`/`fragment`; whitespace-only `symbol`/`fragment`;
   перекрытие «сырых» `line`/`character` найденным match; сохранение «сырых» значений без результата;
   отсутствие `args`.
2. `npm run test:e2e` (без `--clangd`):
   - все тесты, не связанные с clangd, проходят;
   - `semantic-lsp.test.ts` (clangd) не запускается / помечен skipped;
   - итоговый статус прогона — зелёный (код 0);
   - в выводе присутствует сообщение о том, как включить clangd-тесты (`--clangd <path>`).
3. `npm run test:e2e -- --clangd <битый путь>`:
   - сразу (до сборки) печатается заметный баннер `INVALID CLANGD PATH` с причиной;
   - прогон продолжается: clangd-независящие сюиты выполняются как обычно, clangd-сюита падает
     с той же диагностикой, итоговый код прогона — ненулевой;
   - прерывание до сборки с баннером `E2E RUN ABORTED` (ни один тест не запущен) — отдельный
     случай, только для ошибок использования флага: `--clangd` без значения, повторяющийся флаг,
     значение `auto`.
4. `npm run test:e2e -- --clangd <рабочий clangd>` — все 4 e2e-теста проходят:
   - `opencode-tool` — `STATUS: FOUND`, LINE 9, COLUMN 16;
   - `lsp-tool-definition` — модель перечисляет `fragment`/`symbol`;
   - `lsp-goto-definition` — `symbol-finder` вызван (STATUS: FOUND), `lsp goToDefinition`
     с числовыми `line`/`character` вернул `math.ts`, запрещённые tools не вызывались;
   - `semantic-lsp` — `goToDefinition` указывает на `c.cpp`, итоговый ответ содержит `42`.
5. В логах opencode для фикстуры `lsp-project` отсутствует `all LSPs are disabled`
   (присутствует `enabled LSP servers` с `typescript`); вызовы `lsp` не возвращают
   `No LSP server available for this file type.` и модель не получает `SchemaError(Missing key ["line"])`.
6. В README описаны полные требования активации lsp tool и LSP-серверов.

## Вне рамок задачи

- e2e-харнесс POSIX-only: все сюиты запускают opencode через `bash -c "script -q -c '…' /dev/null"`,
  на Windows они неработоспособны независимо от способа поиска `clangd` — поддержка Windows отдельная задача;
- провайдер модели иногда (≈1 запуск из 3) завершает сессию без финального текста: в
  `lsp-goto-definition` ситуация детектируется явно с рекомендацией перезапуска, но в сюитах без
  такой детекции флиг сохраняется.
