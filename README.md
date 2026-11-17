# 23Visuals Launcher

Приватный лаунчер клиента 23Visuals. Скачивает runtime и клиент с GitHub Releases,
проверяет версию через GitHub Pages и запускает Minecraft.

## Требования

- Node.js 20+
- Windows 10/11 x64
- Публичный GitHub-репозиторий для релизов (иначе файлы не скачать без токена)

## Разработка

```powershell
cd launcher
npm install
npm start
```

## Сборка exe

```powershell
npm run dist
```

Результат: `build\23VisualsLauncher-0.3.1.exe`.

## Хостинг

1. Загрузи `docs/version.json` в ветку `main`.
2. Settings → Pages → Source: `main` / `/docs`.
3. Проверь:
   `https://screammholic.github.io/23visuals/version.json`
4. Собери payload:
   ```powershell
   .\tools\make-payload.ps1 -Version 0.3.1
   ```
5. Создай релиз и прикрепи `base.zip` и `client-0.3.1.zip`:
   ```powershell
   gh release create v0.3.1 .\dist\base.zip .\dist\client-0.3.1.zip --title "23Visuals 0.3.1"
   ```

## Важно

- Репозиторий должен быть **публичным**: приватные release assets требуют токен,
  а встраивать токен в лаунчер нельзя.
- Если не хочешь светить исходники — держи публичным только репозиторий лаунчера/релизов,
  а код клиента храни локально.
- Не клади в релиз `saves`, `logs`, аккаунты и лицензионные файлы.

## Как выпускать обновления клиента

1. Собери новый jar и положи его в `client\game\mods`.
2. Собери только клиентский payload:
   ```powershell
   .\tools\make-payload.ps1 -Version 0.3.2 -SkipBase
   ```
3. Создай релиз `v0.3.2` и загрузи только `client-0.3.2.zip`.
4. Обнови `docs/version.json`:
   ```json
   {
     "version": "0.3.2",
     "release": "v0.3.2",
     "client": "client-0.3.2.zip",
     "baseRelease": "v0.3.1",
     "baseVersion": "0.3.1"
   }
   ```
5. Запушь `docs/version.json`.

Игроки при следующем запуске нажмут Play: лаунчер увидит новую версию,
скачает `client-0.3.2.zip`, удалит старые моды и распакует новую сборку.

`baseRelease` указывает, в каком релизе лежит `base.zip`. Если менялись
Java/assets/libraries — пересобери `base.zip`, загрузи в новый релиз,
подними `baseVersion` и поставь `baseRelease` на новый тег.

Сам лаунчер обновляется вручную (новый exe). Клиент — автоматически.

## Аккаунты и ключи

Лаунчер хранит аккаунты локально в `%APPDATA%\23Visuals\accounts.json`
(пароль — scrypt-хэш). Ключи проверяются по `docs/keys.json`.

Создать новые ключи:

```powershell
.\tools\generate-keys.ps1 -Note "beta tester" -Count 5
```

Скрипт выводит ключи один раз и сохраняет только их SHA-256 в `docs/keys.json`.
Запушь `docs/keys.json` — после этого ключами можно регистрироваться.

Регистрация в лаунчере: «Нет аккаунта? Зарегистрироваться» → ник, пароль, ключ.

Ограничение базовой версии: ключ проверяется и помечается использованным
только на конкретном ПК. Для глобальной привязки ключа к одному ПК нужен сервер.