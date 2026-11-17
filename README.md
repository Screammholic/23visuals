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