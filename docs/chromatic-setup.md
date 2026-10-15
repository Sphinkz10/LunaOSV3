# Chromatic (snapshots visuais)

1. Criar projeto em [chromatic.com](https://www.chromatic.com/)
2. Copiar **Project token**
3. Adicionar secret no GitHub: `CHROMATIC_PROJECT_TOKEN`
4. O CI corre Chromatic quando `packages/ui` muda (ver `.github/workflows/ci.yml`)

Local (opcional):

```powershell
pnpm --filter @luna/ui exec chromatic --project-token=<token>
```

Requer Storybook — a activar quando P0.7 Storybook estiver no repo.
