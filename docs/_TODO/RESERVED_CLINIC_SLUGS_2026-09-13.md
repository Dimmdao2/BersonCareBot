# Зарезервированные адреса клиник — узкий список на утверждение (13.09)

Уже закрыто в коде: **228** имён (`organizationSlug.ts` + такой же CHECK в базе) — технические и
инфраструктурные, включая `clinic`, `clinics`, `doctor`, `specialist`. Ниже — **76 новых**: 57 в блоке 1,
19 в блоке 2.
Механизм: блок 1 запрещён только как адрес ЦЕЛИКОМ («Мастерская здоровья» регистрируется свободно),
блок 2 запрещён и целиком, и внутри более длинного адреса.

## 1. Слова про медицину

Берём голое медицинское слово и его реальные написания: латинский оригинал, транслит с кириллицы,
i/y, c/k, s/z, окончания -a/-o.

doktor, doctors, doktors, dokter, doc,
klinika, klinik, klinic, clinika, clinica, clinico, kliniko, clinique,
med, medic, medik, medics, medical, medicine, medicina, meditsina,
vrach, vrachi,
therapist, therapists, therapy, therapia, terapia, terapiya, terapevt, terapist,
bolnitsa, bolnica,
poliklinika, poliklinik, polyclinic,
hospital, hospitals, gospital,
zdorovie, zdorovye, zdorove, healthcare,
apteka, pharmacy, farmacia,
dental, dentist, dentistry, stomatologia, stomatologiya,
medcenter, medcentr, medcentre, med-center, med-centr,
lechenie

## 2. Наши домены и имена владельца

Берём корень нашего бренда и реальные опечатки/транслиты; запись-корень закрывает и все адреса,
внутри которых она встречается (`berson` закрывает `bersoncare`, `dmitry-berson`, `bersonkare`).

berson, bersson, berzon, bercon, bersen,
therapysto, therapisto, terapysto, terapisto, therapy-sto, terapy-sto,
therapygo, therapigo, terapygo, terapigo, therapy-go, terapy-go,
tochka-zdorov, tochkazdorov

## Вопросы

1. Расширять ли блок 1 на названия специальностей (хирург, педиатр, психолог, невролог, офтальмолог,
   кардиолог и т.д.)? Сейчас там только терапевт и стоматология.
2. Оставляем ли `zdorovie / zdorovye / zdorove` — слово общее, а не строго медицинское.
