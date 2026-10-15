# Spike — medição em device real (checklist humano)

## Timer (P0.8)

Ver [timer.md](./timer.md).

| Cenário | iOS | Android | Desvio | OK (≤1s)? |
|---------|-----|---------|--------|-----------|
| 10 min background | | | | |
| Fechar + reabrir app | | | | |

**Como medir:** abrir `/poc` → Live → Descanso 10s ou sessão; pôr app em background; comparar relógio real vs UI.

## Offline (P0.9)

Ver [offline.md](./offline.md).

| Cenário | Resultado | Notas |
|---------|-----------|-------|
| Avião mode + criar marcação | | |
| Reconectar | | |

Preencher após teste em device físico. O agente não consegue simular background nativo neste ambiente.
