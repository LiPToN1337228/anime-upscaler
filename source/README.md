# AnimeSR 0.0.3 — исходники и структура

Эта папка — **референс**, не рабочий проект. Здесь лежит распакованное расширение, которое прислал владелец (zip из Telegram), плюс описание того, как оно устроено. Нужно, чтобы другая модель/разработчик могла посмотреть реализацию, не разбирая бандл с нуля.

```
source/
├─ ANIMESR-0.0.3.zip          исходный архив, как пришёл
├─ animesr-0.0.3/0.0.3_0/     распакованное расширение (можно грузить как unpacked)
└─ README.md                  этот файл
```

## 1. Общие факты

- **Название:** AnimeSR
- **Версия:** 0.0.3
- **Manifest V3**
- **Сборка:** webpack, код минифицирован. `content_script.js` — 1.16 МБ, `popup.js` — 0.59 МБ, `options.js` — 0.49 МБ
- **Языки:** `_locales/en`, `_locales/ja`, `_locales/zh_CN`
- **Канал обновлений:** `update_url` указывает на Chrome Web Store (расширение распространялось через магазин; в магазине сейчас не поддерживается)

## 2. Структура файлов

| Файл | Размер | Что это |
|---|---|---|
| `manifest.json` | 1951 Б | MV3-манифест |
| `js/background.js` | 7 КБ | service worker |
| `js/content_script.js` | 1.16 МБ | **весь движок обработки видео** (webpack-бандл) |
| `js/popup.js` | 0.59 МБ | UI попапа (React-подобный бандл) |
| `js/options.js` | 0.49 МБ | страница настроек |
| `js/i18n.js` | 105 КБ | локализация |
| `popup.html`, `options.html` | ~0.3 КБ | обёртки, весь UI рисует JS |
| `icons/on`, `icons/off` | — | две иконки: включено/выключено |
| `*.LICENSE.txt` | — | лицензии вендорных библиотек |

## 3. Manifest — что важно

```json
"permissions": ["storage", "scripting"],
"host_permissions": ["*://*/*"],
"background": { "service_worker": "js/background.js" },
"commands": {
  "01-animeSrOn":      { "suggested_key": { "default": "Alt+Shift+Q" } },
  "02-animeSrOff":     { "suggested_key": { "default": "Alt+Shift+W" } },
  "03-triggleFpsWindow": {},
  "04-reducePower":    { "suggested_key": { "default": "Alt+Shift+1" } },
  "05-increasePower":  { "suggested_key": { "default": "Alt+Shift+2" } }
}
```

Ключевое: **в манифесте нет секции `content_scripts`**. Скрипт внедряется программно через `chrome.scripting` (отсюда разрешение `scripting` и `host_permissions` на все сайты).

## 4. Как устроен движок (по содержимому бандла)

Всё ниже — факты из кода, искать в `js/content_script.js` по указанным строкам.

### 4.1. Класс обработки видео

- Есть синглтон `VideoProcessor` с методами `addVideoElement`, `removeVideoElement`, `startAll`, `closeAll`, `setPassConstructors`.
- Внутри — `currentProcessorsMap` (Map: video → processor).
- На каждый `<video>` создаётся отдельный объект-обработчик.

### 4.2. Canvas и вставка в DOM

```js
const x = document.createElement("canvas");
x.id = "VideoProcessorCanvas" + this.id;
x.width  = t.videoWidth;
x.height = t.videoHeight;
t.parentNode?.insertBefore(x, t);     // canvas встаёт ПЕРЕД видео в его контейнере
this.setCanvasVisibility(false);      // изначально скрыт
this.adjustCanvasStyle();
```

То есть **canvas в нативном разрешении видео**, вставляется внутрь родителя `<video>`, перед ним. Размер на экране задаётся через `adjustCanvasStyle()`. FPS-окно — отдельный 2D-canvas с `position:absolute; zIndex:99999999`, тоже `insertBefore(x, video)`.

### 4.3. WebGL-контекст

```js
const gl = canvas.getContext("webgl2", {
  depth: false, stencil: false, powerPreference: "high-performance"
});
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
gl.getExtension("OES_texture_float_linear");
gl.getExtension("EXT_color_buffer_float");
```

Текстуры — **RGBA16F / FLOAT**:

```js
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.FLOAT, null);
```

### 4.4. Цикл рендера

Через `video.requestVideoFrameCallback(...)` — на каждый декодированный кадр. Внутри ловятся исключения: при ошибке рендер останавливается (`this.stop()`).

### 4.5. DRM

```js
video.mediaKeys && (VideoProcessor.closeAll(),
                    chrome.runtime.sendMessage({ op: "drmProtectedVideoDetected" }));
```

При обнаружении DRM всё выключается целиком.

### 4.6. Наборы шейдеров

В бандле есть карта модулей:

```
Anime4kRestoreS, Anime4kRestoreM, Anime4kRestoreL, Anime4kRestoreVL, Anime4kRestoreUL,
Anime4kUpscaleS, Anime4kUpscaleM, Anime4kUpscaleL, Anime4kUpscaleVL, Anime4kUpscaleUL
```

Каждый модуль — свой набор шейдерных пассов (обычно несколько пассов на модуль).

### 4.7. «Мощность» (power slider)

Настройки лежат в `chrome.storage.local`:

- `powerSliderFlows` — предустановленные цепочки, у каждой есть массив `passes`
- `userDefinedPassSets` — пользовательские цепочки

Применение:

```js
const flow = powerSliderFlows[i];                 // или userDefinedPassSets[i]
const passes = flow.passes.map(name => modules.get(name));
VideoProcessor.setPassConstructors(passes);
```

**Пример режима 4** (то, что владелец использует на RTX 3060):

```
4: Anime4kRestoreS, Anime4kUpscaleS, Anime4kRestoreS, Anime4kUpscaleS
```

То есть пара «restore + upscale» повторяется дважды.

### 4.8. Кнопки

- `Alt+Shift+Q` — включить, `Alt+Shift+W` — выключить
- `Alt+Shift+1` / `Alt+Shift+2` — уменьшить/увеличить мощность
- `03-triggleFpsWindow` — показать/скрыть окно FPS

## 5. Где искать в минифицированном коде

`js/content_script.js` — одна строка, поэтому ищите по подстрокам:

| Токен | Что найдёте |
|---|---|
| `VideoProcessorCanvas` | создание canvas и вставка в DOM |
| `setPassConstructors` | сборка цепочки пассов |
| `DEFAULT_POWER_SLIDER_FLOWS` | список предустановленных мощностей |
| `powerSliderFlows` | чтение/запись настроек |
| `requestVideoFrameCallback` | цикл рендера |
| `RGBA16F` / `EXT_color_buffer_float` | формат текстур |
| `mediaKeys` | проверка DRM |
| `Anime4kRestoreS` | карта модулей шейдеров |

## 6. Откуда шейдеры

Оригинальные GLSL-шейдеры: **https://github.com/bloc97/Anime4K** (лицензия MIT).
Каталоги:

- `glsl/Restore/` — `Anime4K_Restore_CNN_S/M/L/VL/UL.glsl`, плюс `*_Soft_*` варианты
- `glsl/Upscale/` — `Anime4K_Upscale_CNN_x2_S/M/L/VL/UL.glsl`
- `glsl/Upscale+Denoise/` — варианты с денойзом
- `glsl/Restore/Anime4K_Clamp_Highlights.glsl`

Это формат **mpv user shaders**: файл состоит из директив и функции `hook()`.

```
//!DESC ...
//!HOOK MAIN
//!BIND MAIN
//!SAVE имя_текстуры
//!WIDTH MAIN.w 2 *
//!HEIGHT MAIN.h 2 *
//!COMPONENTS 4
//!WHEN <RPN-выражение>

vec4 hook() { ... }
```

Для запуска в браузере нужен свой мини-компилятор: разобрать директивы, посчитать размеры (RPN: `MAIN.w 2 *`), построить цепочку пассов через framebuffer'ы и подставить макросы `<NAME>_tex`, `<NAME>_texOff`, `<NAME>_pos`, `<NAME>_pt`, `<NAME>_size`, а также алиасы `HOOKED` ↔ имя хука.

## 7. Техническое задание для другой модели

Задача: сделать расширение для Brave/Chrome, которое применяет Anime4K к видео в браузере.

Обязательные требования по поведению (совпадают с AnimeSR):

1. **Canvas внутри контейнера видео**, а не поверх страницы, чтобы не перекрывать контролы плеера.
2. **Размер canvas — не меньше, чем видео на экране.** Если canvas меньше CSS-размера, браузер сам размыливает финальным ресайзом.
3. **RGBA16F** для промежуточных целей, `EXT_color_buffer_float` + `OES_texture_float_linear`.
4. Цикл рендера — `requestVideoFrameCallback`.
5. **Промежуточные текстуры не переиспользовать между кадрами неаккуратно.** Один буфер на пасс, постоянный; при смене размера — пересоздание. Переиспользование «пула» между кадрами приводило к порче цвета (в этом проекте воспроизводилось как зелёный экран: на выходе оставался один канал).
6. Цепочка пассов должна отрабатывать **целиком**. Если апскейл-пассы пропускаются по условию `//!WHEN`, на экран попадает промежуточная текстура (luma) — снова зелёный/серый кадр. Поэтому либо гарантировать условие, либо форсировать полный прогон.
7. DRM: если `video.mediaKeys` — выключаться.
8. Настройки — в `chrome.storage.local`, отдельно по домену.

Полезно сохранить:

- уровни мощности как цепочки: `P2 = Restore + Upscale`, `P3 = Restore + Upscale + Restore`, `P4 = Restore + Upscale + Restore + Upscale`
- авто-режим: мерить время кадра и снижать уровень при нехватке бюджета
- горячую клавишу вкл/выкл и бейдж состояния

## 8. Как проверить, что расширение реально работает

1. `brave://extensions` → «Загрузить распакованное» → папка с расширением.
2. Открыть страницу с `<video>`, нажать F5.
3. Проверить в консоли (F12 → Console) наличие лога от расширения — это отличает «не запустилось» от «запустилось, но эффект слабый».
4. Проверить, что в DOM есть canvas расширения с ненулевыми `width/height`.
5. Проверить цвет: сравнить пиксель из источника и из canvas. Если каналы расходятся сильно — цепочка испорчена.

## 9. Примечание

Эту папку **не надо грузить как рабочее расширение** одновременно с другим, которое делает то же самое: два оверлея на одном видео конфликтуют, а горячие клавиши пересекаются.
