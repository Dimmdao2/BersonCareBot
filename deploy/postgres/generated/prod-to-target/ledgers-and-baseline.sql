--
-- PostgreSQL database dump
--

\restrict 6xzycw3O74f0f9FxN40D7hBJa1BUoZPri2X8OgBphy4ZCgHYN04UzAxR2bLbMUg

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

INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (478, '80525a18ff84fa71e77a6f768951fec3567dbb5a252f4f28dca8cb65d652ce9c', 1800000001000, '0001_patient_booking_runtime_capability');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (479, '9a60ef246a7a1bf4d9f3c97ad71c1be477f3f7156eddce7169a7769fc45bd37c', 1800000002000, '0002_patient_booking_slot_snapshot_settings');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (480, '3243113c84e12a515f210c7c45376c93d64e6bdaad024676e3a8b648f75f5f07', 1800000003000, '0003_patient_booking_lifecycle_capabilities');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (481, '55c318b4d5836a0d8c6c57e53a282d8d668c6467e7cfcd4ecbc6757e32bc034d', 1800000004000, '0004_patient_booking_delegated_snapshot_context');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (482, '855e8941d3aae907b17e0fcc3130101cf5530b818ccfb949fd281090906114b6', 1800000005000, '0005_patient_booking_payment_config_capability');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (483, '63f992ffb95136968dd11abfce5d62d93b50a20f391da849c8cb2c528dca7610', 1800000006000, '0006_patient_booking_prepayment_policy_capability');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (484, '36c04954b270fa7488d15521e7368a992b7074240270ff2ebf78842bff35e60f', 1800000007000, '0007_patient_booking_lifecycle_notification_setting');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (485, '8077c27c8069fc6d47490650798acf4a036c466b67b5c2f303aa07b9bf4577ac', 1800000008000, '0008_patient_booking_reminder_preference_capability');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (486, 'ddec35db1dcb505a77360b09e0dbc65ec0bc313403c119514306b5883c5d14e5', 1800000009000, '0009_current_patient_lfk_session_capability');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (487, '72e0f148e2e88386207494df86d756a2d6c9d955d7ab5d2e2547ac7a6802fd72', 1800000010000, '0010_current_patient_staff_notification_profiles');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (488, '2c78a1950d9d5a6da1d5a7ce66d6819b645f2610b63a80fa23ed195ce2a6c11e', 1800000011000, '0011_current_patient_staff_notification_profiles_binding_order');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (489, '483f6433670a2041962ced55a9ffe6361da7cd19cd20979e3a8f6e0834c2848e', 1800000012000, '0012_integrator_web_push_delivery_capabilities');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (490, '316546c88fccefe5255319347f91eabc4d408b9b98434d93a96c3d3f29df71d6', 1800000013000, '0013_integrator_support_delivery_attempt_capability');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (491, '932e94a5868b4ac0545f29e4cedda24b20e7b8ac79d5c699ee79c8daed490da2', 1800000014000, '0014_patient_practice_and_material_rating_capabilities');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (492, '2b563309105100435994606dd64006f5ac6f02769bb0569fb7c938ccb73f315c', 1800000015000, '0015_patient_self_identity_capability');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (493, 'ce2d3c3a3b7af9964f955bc802633fcb32b645ef8a11eb3c7b7757d3f5aec121', 1800000016000, '0016_patient_self_action_capabilities');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (494, 'deb3c6c187bd9a511a9b0244d5716dc8355df257976bd1f97dba59b0911735f8', 1800000017000, '0017_patient_shared_core_capabilities');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (495, '58d7226a3e4281b35be8c543bad43051eaa529a2b742d1634942d14713ef467d', 1800000018000, '0018_clinic_owner_tariff_branch_quotas');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (500, '688b6c79fc588dd26bb076f70f3425567efd17931aca03c61d55b2d47c422b32', 1800000021000, '0021_patient_program_item_narrow_column_reads');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (511, '06b2a5142ae7d927115fdfb7d2e9927aba7f45e9c9010645836e50b8cac26f96', 1800000028000, '0027_warmup_feeling_uses_the_whole_five_point_scale');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (514, 'f26955d80f2c4d66e9d780880701c0a6d11a36495d9f44b0d50c7b6f40617d26', 1800000030000, '0029_retention_of_the_failure_archive_is_not_tenant_work');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (522, '26ea73b932009bcd273022eaca027581de9e9318197394043eac748173d6e8d6', 1800000032000, '0031_one_retention_root_with_a_closed_list_of_targets');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (523, '4644af260c7f207ea497bed9be829151d919fc41020acc268a2568a8faac53b4', 1800000033000, '0032_a_shown_photo_is_our_own_re_encode');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (540, 'f7aa2607e09f16e8b542a9e51e7a5ac8bdf4b6d172722933667eab01c9add17b', 1800000038000, '0037_the_patient_reads_own_contacts_and_writes_own_booking_contact');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (558, '47aaa1a7696311cd3f09b865c4b98c758fa9e75758872d722531970597586ec1', 1800000048000, '0047_the_public_funnel_had_no_door_of_its_own');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (559, '74b391b139769ec18509f5d8646147b746b3c9384c1a16b2b94dd0438f46401f', 1800000050000, '0049_a_clinic_had_a_booking_form_but_no_face');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (497, '2c9ec12402f84db364402f5f890e26fa7130ada12408ddba841d43415274da0a', 1800000019000, '0019_patient_reminder_materialization_runtime_capabilities');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (499, '1607be2abcc3f4f6675722b8916343ef38aa306b56d4a0434074c6e42f9f8313', 1800000020000, '0020_patient_reminder_materialization_narrow_column_reads');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (502, '249e2378e4155bf7801b6e2601daface031cc2dc3591b4eb46fd3f8eb35d2840', 1800000022000, '0022_quota_mechanics_have_no_off_state');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (504, '0c3b0092360f3e18ed9b4f632ca9e32e0133b20671cbf6e3a81840bb08be2e50', 1800000023000, '0023_purchased_tariff_invoice_refresh');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (506, '083028c8ef013b3193ce6823294855da63388d6d28f95b8ffb76e466f1a56c3e', 1800000024000, '0024_first_tariff_choice_awaits_payment');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (508, '6210b85489b25af1b31eb177665fcc8aadb6273ceac2a27bbb9a5941b78fac89', 1800000025000, '0025_definer_bodies_that_lived_only_in_dev');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (510, '3734710934d83f176fed9d849a208ab16ecd0a763470cc2739bd8b75e7906972', 1800000027000, '0026_handwritten_login_gates_that_lived_only_in_dev');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (513, 'fbb6ea2cb07984cf722e5a135614471f296784c4e5e6cb4b1078f3065023b990', 1800000029000, '0028_port_context_rows_die_with_their_transaction');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (521, 'a2b79f9b8c0cd60e1aa79170e434162852dc27f250ecf79d7722c6ea3fd7fc9d', 1800000031000, '0030_a_delivery_audience_is_resolved_in_one_place');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (529, 'f74c179275c58710365801f157d955460c46e1f7080f5f7279f164f8efc22396', 1800000034000, '0033_one_declared_root_puts_a_message_in_the_queue');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (531, '5b280c80c2d7befdbd8a31a01eac6d607eae9511f45137c5b09e713775124b18', 1800000035000, '0034_a_new_clinic_needs_a_reference_catalog_to_copy');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (533, '5b280c80c2d7befdbd8a31a01eac6d607eae9511f45137c5b09e713775124b18', 1800000036000, '0035_one_declared_root_replaces_a_reminder_generation');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (535, '8038c228d569f33cb99667954063074514df12579f541826dc1d0e9bb31d1693', 1800000037000, '0036_the_content_argument_cannot_survive_the_wire_as_jsonb');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (542, '6d638023ac727b89accc02d4a3f9862e2e64a078194e8699f52a7ab5a30dc552', 1800000039000, '0038_a_star_takes_columns_the_seam_never_asked_for');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (544, '0e1ba0b116c2e12f1a341b39b1b63183153c309e5913893f5fdd9a74a82ed8fa', 1800000040000, '0039_the_operator_watchman_may_not_read_its_own_queue');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (546, '7060b811d4c0c83d3bea1d6d4c1630fc1a48454ff45a79c44a8919f13daaf5bc', 1800000041000, '0040_two_machine_ticks_had_no_door_of_their_own');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (548, '3f7f0ef33c32bc1e6d412e8f6e293dc6a219fbc19f858e88e2340c4465f2ef29', 1800000042000, '0041_the_watchman_could_read_incidents_but_not_open_one');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (550, 'ca24ee92b5c24c031cb1c891319ffbd38e696cf3aa18f5cb384478fb7fe60f62', 1800000043000, '0042_the_bridge_to_a_retired_system_is_not_a_bridge');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (553, '55a2540d35f8842988b3ff8958688d803e37503db497415ed7ad9b2460aa9187', 1800000044000, '0043_a_clinic_name_must_not_shadow_a_product_route');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (554, '5957d9789c00a500f50e5bf17dd152516aaafe71e1e9d3188ed60db3edcee109', 1800000045000, '0044_a_link_to_a_video_host_is_a_kind_of_media');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (555, 'f0ec345f5b982fe0df7a504b2f8e667f72b1ac64f7d59d7bab37383618df15fc', 1800000046000, '0045_the_platform_dashboard_read_nineteen_tables_through_no_door');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (557, 'd5bacb2a2238dd8edf23469d1d1f4aa3a878b329fcbe6954675f14426cc221f2', 1800000047000, '0046_a_dead_row_from_june_is_not_todays_outage');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (593, '38625073a05661ddd3b0c90ed24bf19f6208d6a0b9f412e632bf8ae0b26a4e0c', 1800000051000, '0047_the_opening_door_did_not_learn_the_new_alarm_words');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (585, '228d8d4d652bca0248b084e6d69d5ee59dca3c8eb6108f9eca339f38de4c49dd', 1800000060000, '20260819T180713_a_lifetime_allowance_counted_by_join_is_not_lifetime');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (587, 'ba4a69129732ff76f639cf0459697fcf9e13b59a3a77069c0fe7496880492b9f', 1800000053000, '20260819T170216_a_public_visitor_becomes_a_client_when_identified');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (588, 'efdb857d09bcf0f22b53737b36fa639cbb09a49099e4f45f67568c6e47426914', 1800000055000, '20260819T163536_a_failed_public_booking_must_not_leave_a_client');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (589, '556c698a61df85ef709c67c4959fd5861143d1119c0237787bee0a61374dbfc8', 1800000056000, '20260819T182039_a_visitor_booking_spends_no_tariff_seat');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (624, '83df3f21ecb97fa497a471dea38f88806c5138cb2cb6d9e33d6c5da2a5e6ea25', 1800000074000, '20260820T010127_the_platform_admin_could_read_org_active_but_not_flip_it');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (619, '7f78a9b99869994799081d8cd17282adc0e7850d818509201353a57b85bf1091', 1800000071000, '20260819T204355_a_seat_invoice_is_not_cancelled_it_is_reissued');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (620, '66db5bf7824af292e1a0ec2fc5bac40c76c602a03cf248098f19d1f5b93369dc', 1800000072000, '20260819T205420_the_transcode_queue_dispatcher_had_no_door');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (621, 'd6b739a9e3c12bb5a796c9b1ac9298bb82f634ea3fed17866e02e566711292cd', 1800000073000, '20260819T210005_a_clinic_is_billed_for_seats_not_for_people');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (598, 'c13927102c549a4d9bfa74f6c600471d1583ee55534217905071fb110acf5124', 1800000070000, NULL);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (477, '1a9c925f2f5b411bca309187d06cdaaec198602fd51e85e6d9554943d9ba7963', 1800000000000, '0000_b0_baseline');


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

\unrestrict 6xzycw3O74f0f9FxN40D7hBJa1BUoZPri2X8OgBphy4ZCgHYN04UzAxR2bLbMUg
