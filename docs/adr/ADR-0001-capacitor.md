# ADR-0001 — Capacitor (e não React Native)
**Decisão:** React web + Capacitor + PWA para as 3 plataformas.
**Porquê:** o ativo mais valioso é a camada visual madura e desktop-leaning (gradientes navy, sombras 4 camadas, SVG, Cmd+K, DnD). Capacitor preserva-a tal e qual (~95% reuso); RN obrigaria a reescrevê-la. Mitigação Apple 4.2: push+haptics+biometria+offline reais antes da submissão (F7→F9).
**Reabrir se:** na F10, testes com atletas mostrarem que o WebView não chega para a app do atleta.
