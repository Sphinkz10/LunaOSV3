# Spike P0.8 — Timer em background (Live)
**Hipótese:** timers por TIMESTAMPS (não por contagem de intervalos) + Local Notification no fim do descanso dão fiabilidade em background.
**Protótipo:** packages/core/src/spike-timer.ts (puro, testável). Integração Capacitor (App + LocalNotifications) a medir EM DEVICE REAL iOS e Android.
**Medir:** desvio após 10 min em background e após fechar/reabrir a app. ✓ aceitável: ≤1s.
**Estado:** protótipo pronto; medição pendente de device (não executável neste ambiente).
