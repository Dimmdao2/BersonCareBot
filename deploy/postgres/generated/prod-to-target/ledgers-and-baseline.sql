--
-- PostgreSQL database dump
--

\restrict 0e3eaa0510279075d7a98a0c39483f5c73b06e0724043adca0d1963182a26f3

-- Dumped from database version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: __drizzle_migrations; Type: TABLE DATA; Schema: drizzle; Owner: -
--

INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (585, '228d8d4d652bca0248b084e6d69d5ee59dca3c8eb6108f9eca339f38de4c49dd', 1800000060000, '20260819T180713_a_lifetime_allowance_counted_by_join_is_not_lifetime');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (587, 'ba4a69129732ff76f639cf0459697fcf9e13b59a3a77069c0fe7496880492b9f', 1800000053000, '20260819T170216_a_public_visitor_becomes_a_client_when_identified');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (588, 'efdb857d09bcf0f22b53737b36fa639cbb09a49099e4f45f67568c6e47426914', 1800000055000, '20260819T163536_a_failed_public_booking_must_not_leave_a_client');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (589, '556c698a61df85ef709c67c4959fd5861143d1119c0237787bee0a61374dbfc8', 1800000056000, '20260819T182039_a_visitor_booking_spends_no_tariff_seat');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (624, '83df3f21ecb97fa497a471dea38f88806c5138cb2cb6d9e33d6c5da2a5e6ea25', 1800000074000, '20260820T010127_the_platform_admin_could_read_org_active_but_not_flip_it');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (619, '7f78a9b99869994799081d8cd17282adc0e7850d818509201353a57b85bf1091', 1800000071000, '20260819T204355_a_seat_invoice_is_not_cancelled_it_is_reissued');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (620, '66db5bf7824af292e1a0ec2fc5bac40c76c602a03cf248098f19d1f5b93369dc', 1800000072000, '20260819T205420_the_transcode_queue_dispatcher_had_no_door');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (621, 'd6b739a9e3c12bb5a796c9b1ac9298bb82f634ea3fed17866e02e566711292cd', 1800000073000, '20260819T210005_a_clinic_is_billed_for_seats_not_for_people');


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: integrator; Owner: -
--

INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260816_0000_b0_baseline.sql', '2026-08-16 18:17:08.18186+03');


--
-- Data for Name: saas_billing_periods; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.saas_billing_periods (code, label, months, is_selectable, sort_order, created_at, updated_at) VALUES ('day', 'День (снят)', 1, false, 0, '2026-08-07 12:08:32.215146+03', '2026-08-07 12:08:32.215146+03');
INSERT INTO public.saas_billing_periods (code, label, months, is_selectable, sort_order, created_at, updated_at) VALUES ('month', 'Месяц', 1, true, 10, '2026-08-07 12:08:32.215146+03', '2026-08-07 12:08:32.215146+03');
INSERT INTO public.saas_billing_periods (code, label, months, is_selectable, sort_order, created_at, updated_at) VALUES ('half_year', 'Полгода', 6, true, 20, '2026-08-07 12:08:32.215146+03', '2026-08-07 12:08:32.215146+03');
INSERT INTO public.saas_billing_periods (code, label, months, is_selectable, sort_order, created_at, updated_at) VALUES ('year', 'Год', 12, true, 30, '2026-08-07 12:08:32.215146+03', '2026-08-07 12:08:32.215146+03');


--
-- Data for Name: saas_tariffs; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.saas_tariffs (id, name, description, price_minor, currency, mechanics, is_active, created_at, updated_at, included_seats, billing_period, quotas, system_access_policy, mechanic_access_policies, downgrade_policies, additional_seat_price_minor, discounted_price_minor, mailing_templates) VALUES ('59fbb0c9-371d-4fcc-8602-78e174c81062', 'КЛИНИКА', 'Все что есть в ПРОФИ, плюс:
возможность работать командой
включено 3 кабинета специалиста (каждый последующий +500р в месяц)
до 10 филиалов (локаций)
Собственный бренд и логотип
Возможность подключить собственный домен', 280000, 'RUB', '{"files": true, "booking": true, "courses": false, "branding": true, "mailings": true, "payments": true, "cms_pages": false, "clinic_team": true, "patient_app": false, "patient_card": true, "custom_domain": true, "subscriptions": true, "exercise_catalog": true, "exercise_packages": false, "patient_app_paid_subscription": false}', true, '2026-07-26 02:25:00.396696+03', '2026-07-26 02:25:00.397+03', 3, 'month', '{}', NULL, '{}', '{}', NULL, NULL, '[]');
INSERT INTO public.saas_tariffs (id, name, description, price_minor, currency, mechanics, is_active, created_at, updated_at, included_seats, billing_period, quotas, system_access_policy, mechanic_access_policies, downgrade_policies, additional_seat_price_minor, discounted_price_minor, mailing_templates) VALUES ('2512c9fd-128d-484d-a83c-3593ae56fe8a', 'ПРОФИ', 'Все что в тарифе СТАРТ плюс:
Неограниченное количество клиентов
Абонементы и онлайн оплата при записи
Возможность настроить частичную или полную предоплату
Информационные и рекламные рассылки в пуш и на email', 150000, 'RUB', '{"promo": false, "booking": true, "courses": false, "warmups": false, "branding": false, "mailings": true, "payments": true, "cms_pages": false, "custom_domain": false, "online_intake": false, "subscriptions": true, "clinical_tests": false, "exercise_catalog": true, "specialist_tasks": false, "doctor_statistics": false, "exercise_packages": false, "external_calendar": false, "booking_prepayment": false, "patient_home_today": false, "patient_app_paid_subscription": false}', true, '2026-07-26 02:20:55.016818+03', '2026-08-01 16:05:56.944+03', 1, 'month', '{}', '{"graceDays": 21, "readOnlyDays": 7, "notifications": [], "terminalState": "read_only"}', '{}', '{}', NULL, NULL, '[]');
INSERT INTO public.saas_tariffs (id, name, description, price_minor, currency, mechanics, is_active, created_at, updated_at, included_seats, billing_period, quotas, system_access_policy, mechanic_access_policies, downgrade_policies, additional_seat_price_minor, discounted_price_minor, mailing_templates) VALUES ('e07db366-f471-40a5-bc9b-499908636acd', 'СТАРТ', 'Все необходимое для старта. Полноценное сопровождение клиентов, назначение индивидуальных программ, защищенный чат, публичная страница и удобная запись на прием по цене меньше чем сервисы для онлайн-записи.', 80000, 'RUB', '{"promo": false, "booking": true, "courses": false, "warmups": false, "branding": false, "mailings": false, "payments": false, "cms_pages": false, "clinic_sms": false, "clinic_smtp": false, "custom_domain": false, "subscriptions": false, "clinic_max_bot": false, "exercise_catalog": true, "specialist_tasks": false, "doctor_statistics": false, "exercise_packages": true, "external_calendar": false, "booking_prepayment": false, "patient_home_today": false, "clinic_telegram_bot": false, "patient_app_paid_subscription": false}', true, '2026-07-26 02:16:33.324227+03', '2026-08-17 02:41:32.968+03', 1, 'month', '{}', NULL, '{}', '{}', NULL, NULL, '[]');
INSERT INTO public.saas_tariffs (id, name, description, price_minor, currency, mechanics, is_active, created_at, updated_at, included_seats, billing_period, quotas, system_access_policy, mechanic_access_policies, downgrade_policies, additional_seat_price_minor, discounted_price_minor, mailing_templates) VALUES ('d1156dc6-e71e-4225-ad94-93c9d423c9e1', 'ПОЛНЫЙ ДОСТУП - РАЗРАБОТЧИК', '', 0, 'RUB', '{"promo": true, "booking": true, "courses": true, "warmups": true, "branding": true, "mailings": true, "payments": true, "cms_pages": true, "clinic_sms": true, "clinic_smtp": true, "custom_domain": true, "subscriptions": true, "clinic_max_bot": true, "exercise_catalog": true, "specialist_tasks": true, "doctor_statistics": true, "exercise_packages": true, "external_calendar": true, "booking_prepayment": true, "patient_home_today": true, "clinic_telegram_bot": true, "patient_app_paid_subscription": true}', true, '2026-07-25 20:15:14.807477+03', '2026-08-20 01:56:09.420579+03', 1000, 'year', '{"files": {"kind": "unlimited", "unit": "bytes", "limit": null, "warningAtPercent": null}, "branches": {"kind": "unlimited", "unit": "items", "limit": null}}', NULL, '{}', '{}', NULL, NULL, '[]');


--
-- Data for Name: saas_paid_period_policy; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.saas_paid_period_policy (key, post_paid_period_behavior, post_paid_period_tariff_id, is_active, updated_by, created_at, updated_at) VALUES ('global', 'read_only', NULL, true, NULL, '2026-08-07 12:08:32.215146+03', '2026-08-07 12:08:32.215146+03');


--
-- Data for Name: saas_registration_tariff_policy; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.saas_registration_tariff_policy (key, tariff_id, updated_by, created_at, updated_at) VALUES ('global', '59fbb0c9-371d-4fcc-8602-78e174c81062', NULL, '2026-08-01 15:21:48.076728+03', '2026-08-01 15:21:48.076728+03');


--
-- Data for Name: saas_trial_policy; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.saas_trial_policy (key, duration_days, start_event, post_trial_behavior, post_trial_tariff_id, is_active, updated_by, created_at, updated_at, discount_window_days) VALUES ('global', 30, 'organization_provisioned', 'blocked', NULL, true, NULL, '2026-07-26 02:26:34.787873+03', '2026-07-26 02:26:34.787873+03', 0);


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE SET; Schema: drizzle; Owner: -
--

SELECT pg_catalog.setval('drizzle.__drizzle_migrations_id_seq', 624, true);


--
-- PostgreSQL database dump complete
--

\unrestrict 0e3eaa0510279075d7a98a0c39483f5c73b06e0724043adca0d1963182a26f3
