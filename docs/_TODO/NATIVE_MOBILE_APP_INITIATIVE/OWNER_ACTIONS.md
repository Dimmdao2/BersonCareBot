# Owner actions — native mobile app

Агенты могут подготовить код, инструкции, store texts и evidence. Следующие действия требуют владельца.

| ID        | Что сделать                                                                                                                                                                                    | Когда                                        | Что сохранить как evidence                      |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------- |
| `MOB-O1`  | Выбрать first release persona: patient / staff / оба                                                                                                                                           | до `MOB-00` acceptance                       | dated decision                                  |
| `MOB-O2`  | Выбрать distribution order: RuStore/direct Android, Google Play, App Store                                                                                                                     | до build/release design                      | dated decision                                  |
| `MOB-O3`  | Утвердить единый platform binary; per-org native apps оставить отдельным будущим решением                                                                                                      | до bundle IDs                                | dated decision                                  |
| `MOB-O4`  | Выбрать store billing model вместе с billing owner: IAP/store billing, consumption-only companion или другой допустимый путь                                                                   | до mobile checkout UI                        | written decision + policy review                |
| `MOB-O5`  | Открыть Apple Developer account от правильного seller/legal entity; для организации подготовить D-U-N-S, полномочия, work email/site                                                           | до iOS signing/APNs                          | account/team IDs без private keys               |
| `MOB-O6`  | Открыть Android developer/distribution accounts и Firebase project под правильной организацией                                                                                                 | до Android push/store                        | project/app IDs без service keys                |
| `MOB-O7`  | Предоставить owner-approved macOS/Xcode runner или физический Mac для iOS build/signing                                                                                                        | до `MOB-01` iOS PASS                         | runner ownership/access record                  |
| `MOB-O8`  | Заказать legal/privacy review Apple/Google/APNs/FCM и трансграничной передачи token/payload metadata (`G-04B`)                                                                                 | до real provider TEST/PROD                   | заключение/DPA/vendor register                  |
| `MOB-O9`  | После agent census одним пакетом принять/скорректировать exact event/field preview matrix и service email/SMS/operator allowlists; общий принцип полезного push уже решён и не переоткрывается | до `NTF-01/N3` content builders и production | dated field matrix acceptance + `G-04B` linkage |
| `MOB-O10` | Провести real-device acceptance и вручную открыть store submission/release window                                                                                                              | каждый release                               | checklist, store submission ID, source SHA      |

## Важные внешние gates

- Apple organization enrollment требует legal entity, D-U-N-S и полномочия:
  [официальные требования](https://developer.apple.com/help/account/membership/program-enrollment).
- Apple/Google могут требовать store billing для цифровых функций/подписок. До решения нельзя просто встроить
  текущий CloudPayments checkout:
  [Apple 3.1](https://developer.apple.com/app-store/review/guidelines/),
  [Google Play Payments](https://support.google.com/googleplay/android-developer/answer/9858738).
- Иностранный push provider видит как минимум device token и delivery metadata. Payload policy снижает объём, но не
  превращает APNs/FCM в российское хранилище; правовую квалификацию закрывает не агент.
