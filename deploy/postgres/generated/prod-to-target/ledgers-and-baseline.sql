--
-- PostgreSQL database dump
--

\restrict 0e3eaa0510279075d7a98a0c39483f5c73b06e0724043adca0d1963182a26f3

-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

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

INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (789, 'e8c73647efe09ab31da9d33e6a7bc5892fc316c81eb9bc956c3e3c02560094a8', 1800000120000, '20260822T180000_one_door_records_the_act_of_binding_a_person_to_medicine');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (740, '88d48136897fb6ccce273037e213b985c9dc368c45c2d0ce8e37d5bc9210364e', 1800000097000, '20260822T110000_the_reminder_rule_upsert_gets_a_named_root');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (741, '6710a1d772852629bb720135cef7c7c40ce09c8227db625b6ea3090a22bf90b3', 1800000098000, '20260822T110100_the_reminder_delivery_event_gets_a_named_root');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (742, 'aad797232ce7793296e20115aaaa39a3fb5ffb79283fe5a6f799d6c49b4fa397', 1800000099000, '20260822T110200_the_content_access_grant_gets_a_named_root');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (743, '055103c471cdfd7fe41f4194f808ab43fc00b826a7da97ecf87000f29dec75fd', 1800000100000, '20260822T110400_the_notification_delivery_attempt_gets_a_named_root');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (744, '8dee95e41e2c478572e79b7ee1f8e55948b9a082603e7d706652c32a2ab64883', 1800000101000, '20260822T110500_the_broadcast_audit_counter_gets_a_named_root');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (745, 'bdd969cd5e694f6e66a58f67e3f0e887f0d0152e9cafafffe468934a23456485', 1800000102000, '20260822T111000_the_bot_blocked_marker_gets_a_named_root');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (746, 'cdbace20ee31669b806f5dfce51bdaec23f1633bebfb4bac4a639f99b4abd1e5', 1800000103000, '20260822T111100_the_messenger_phone_bind_audit_gets_a_named_root');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (747, 'bbffd6ea512556a8c93d8252b09e00e85e46ce12eca25aa61183391542a851b8', 1800000104000, '20260822T120000_the_provisioned_trial_names_the_columns_its_tables_have');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (750, '4ef5d3b79b07752c515de3961cceacd3851e87d2ed28425f17fd936d72eb155d', 1800000105000, '20260822T121000_the_specialist_task_reminder_generation_gets_a_named_root');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (697, '5a2c9214a434af91cf39734334f75796431aa396659ba37d29b11302694bdd8b', 1800000096000, '20260822T110000_the_email_verify_root_demotes_the_previous_primary');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (819, 'd53aec1b19f0d698a9758b6d14bbb54adede893e64dc245ef408e3f9b9de6c53', 1800000127000, '20260823T043206_deliver_c4_mail_profile_tenant_binding');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (629, 'b301d1dab844a86f624943881ecf999d689bddcb32ad8c440409cee2905edc8f', 1800000075000, '20260820T100444_direct_public_write_retries');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (630, '21700c35b550f6ca3fcf59a1a6589c02f882962645ee895f28abc60d984e7c23', 1800000076000, '20260820T112313_reminder_occurrence_delivery_capability');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (631, '24385d07cae4fb9b7504135dc80d9446d5a43d2a34a894997baa8ecfaed412cc', 1800000077000, '20260820T114223_appointment_bound_patient_payments');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (632, 'e3972e0e3c0a93eb00ec6600a75a065b01d4f4ab3e19f5b996b9b47d525063ce', 1800000078000, '20260820T122628_direct_public_write_retry_org_invariant');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (634, '63aedb1f4c3eabb3b4e8459da305a0a8c4dc8a596dfcb07b11f6b9f35e17d76b', 1800000079000, '20260820T175432_paid_period_global_access_authority');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (636, 'd7bbe891be7ac15b895ec6ed7aa3c6b884a005c6032705dd17b4cfdea1106109', 1800000080000, '20260820T185707_the_delivery_journal_accepts_a_nonqueue_attempt');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (643, '99098bff2eef013ff3b12ece21196820dbf3c544987bbd47406f75e550f0f708', 1800000083000, '20260821T002100_move_outgoing_delivery_retention_to_producer_root');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (645, 'ff3a4320be5e89f1a4c58a0ef77933e64a19729e399a3c3fbc5f9102ab7e4065', 1800000084000, '20260821T003000_cut_over_delivery_attempt_history');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (647, 'd2c07f2853a96dc0d5662b855bf0390c33f0f5ccc4ef2a11206bcb8a93afcbf9', 1800000085000, '20260821T025935_restore_reference_catalog_baselines');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (791, '40069ca47c4a5bd05472d15e34c6256c80728022d4dc8a6df8754ba5df4f69b4', 1800000121000, '20260823T010000_patient_subdomain_slug_and_custom_domain_uniqueness');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (795, '369ae3b27840483769d4f6c584f6ffce2ce74a55f541bfb00516d042086ce864', 1800000123000, '20260823T010000_mail_profile_reaches_auth_delivery');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (753, '576063bd82ab82be3765a11111c3c1833ec0c2baf8b12aa2cdf6900e9a72ed2d', 1800000106000, '20260822T130000_the_integrator_roots_name_the_integrator_role');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (756, 'd165498d35a804641a9f736a2005aecd8dd150f61604b88aab5bd38b36e2757d', 1800000107000, '20260822T130000_the_registration_resend_door_finds_the_unconfirmed_draft');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (677, '7ffa1e6e18b532035989e12bc2059e93ab49a103e3cee4b81f4eba93867c8471', 1800000089000, '20260821T070000_pre_session_find_session_user_by_phone');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (678, '080a9b20e4809c20c7995c76e900c2d53a8ec50f3e53318083d6083d6abf53c0', 1800000090000, '20260821T080000_pre_session_phone_confirm_resolve');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (679, 'c535cca24cd70ef59465386662e6680a3c5bcc3c9b359b4067b3813efd29e368', 1800000091000, '20260821T090000_pre_session_messenger_channel_resolve');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (757, 'f59979570e7c1a80d40befc4f57c01666697ea5495ae7c8446d7c9fecd61834c', 1800000108000, '20260822T140000_the_shared_roots_name_the_role_of_their_door');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (686, '98a1e62059678af5e7bac84b544a157f1a2eabcc96fba782fdaab5c9ff3addc9', 1800000093000, '20260822T010000_the_phone_bind_root_names_the_colliding_account');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (687, '6cab474ca15fdbd619a6e878bee688c3d14e4b195fc78fddd64a2b0bd0c93fdb', 1800000094000, '20260822T090000_the_email_contact_door_names_its_real_index');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (689, '8663be928c0f706a7723a5b2b11ea7d658d2beda0fe57bc77f96a7204d501046', 1800000095000, '20260822T100000_pre_session_email_and_signup_roots_accept_their_named_context');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (816, 'f36466a1f9169999da104e4b7ab7e14823549919361a2afee0d07fb8c1a62cf8', 1800000125000, '20260823T021426_broadcast_drafts_belong_to_doctor_and_clinic');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (817, '21882a904500c65dc7948e8d07f8e19ba68c3f917ed1b64d6163f397b4433202', 1800000126000, '20260823T023138_pre_session_default_auth_otp_channel');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (829, 'c4fc774b7c7f30109f57d05fd1432a5785277d09578f64ddfddbbf0206a3a678', 1800000128000, '20260823T030000_integrator_tenant_role_reaches_delivery_roots');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (830, '04a951d2b04c0ef99dea79192e8386498457b2ddab8ceb5f178f8e7e3253cf46', 1800000129000, '20260823T035715_clinic_platform_integration_availability_door');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (831, 'fcc98677f8fea4aae5fd22e332325e413ee2285887aa4e9de94bb1df46766954', 1800000130000, '20260823T101403_align_organization_slug_claims_with_address_policy');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (585, '228d8d4d652bca0248b084e6d69d5ee59dca3c8eb6108f9eca339f38de4c49dd', 1800000060000, '20260819T180713_a_lifetime_allowance_counted_by_join_is_not_lifetime');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (587, 'ba4a69129732ff76f639cf0459697fcf9e13b59a3a77069c0fe7496880492b9f', 1800000053000, '20260819T170216_a_public_visitor_becomes_a_client_when_identified');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (588, 'efdb857d09bcf0f22b53737b36fa639cbb09a49099e4f45f67568c6e47426914', 1800000055000, '20260819T163536_a_failed_public_booking_must_not_leave_a_client');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (589, '556c698a61df85ef709c67c4959fd5861143d1119c0237787bee0a61374dbfc8', 1800000056000, '20260819T182039_a_visitor_booking_spends_no_tariff_seat');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (624, '83df3f21ecb97fa497a471dea38f88806c5138cb2cb6d9e33d6c5da2a5e6ea25', 1800000074000, '20260820T010127_the_platform_admin_could_read_org_active_but_not_flip_it');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (640, '4fc3377305f80c7460af9c73a2fa1a7c0f8227a143068138ca4406fcb303789b', 1800000081000, '20260820T210709_retire_projection_outbox');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (641, '4143e15d93ba7fdecaa3a33b4b5670f678fd58c0b55306e87960a76890c6daae', 1800000082000, '20260821T001200_parameterize_integrator_outgoing_delivery_enqueue');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (653, '592a26046f44465bd0e9bd5a59aa1839e0e6a8b78ee17c84d246d4c4f9cb447d', 1800000086000, '20260821T040000_cut_over_canonical_contacts');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (654, '09ca1666e98a9172155163d63a23a82bd123f699881a832f89a15b39bdd0ac9a', 1800000087000, '20260821T050000_add_vk_messenger_settings');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (682, '40d77e5fc76e8202f9372d9dd4af17d080d3ed7a883728a3126acf656037dc10', 1800000092000, '20260821T100000_platform_integration_availability_gains_vk');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (799, '17d0e6ec0a216a9b354f6df3f567744c38b3886387227dc231ddcbc5cff34a3a', 1800000124000, '20260823T002500_pre_session_login_uses_two_named_doors');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (845, '807984946ec25b302d3586426e25dea46f145485febcdab99a26e36b12fc2913', 1800000131000, '20260823T064034_patient_brand_has_one_name_and_one_accent');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (846, '530f28acb69073d49efdb78b5730bfeeb88e0e191c10e7993897e1446f41aab8', 1800000132000, '20260823T093000_channel_identity_root_becomes_lookup_only');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (774, '6d1dd051889c15424ebebdc2c37a5e5cdef02963efecbb6a8a1a53ea1466db89', 1800000114000, '20260822T190000_the_incoming_recipient_door_opens_for_the_integrator_principal');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (775, '5460f8d2998762ad0fc86720c0143e9f91677b9f3f64ade61aa20456762cfa6f', 1800000115000, '20260822T200000_remove_legacy_identity_resolver_signatures');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (847, '698d80de9c4d5991eeeb3229dc5d2af12f320ebc664cacc34d7dc47e82a6a23f', 1800000133000, '20260823T110000_phone_messenger_bind_claims_are_token_bound');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (848, 'e08409401b7908cabcaad6d2034538c1ecd8a7682dc006a5597107095d226f6d', 1800000134000, '20260823T145002_phone_messenger_bind_claimed_secret_pre_session_gate');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (849, 'ba6e9fac1a025d25132eea5a1d1ed5b1c4170dfb15f68ba8f9b772cfa52ca1b6', 1800000135000, '20260823T160000_retire_reminder_rule_m2m');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (850, '0ce7cc9682ea260a4cfab57c49b5073420da19110faa3783212c4093fefa65fe', 1800000136000, '20260823T173446_split_auth_settings_by_surface');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (916, '3010d8a218f2a6d45e063939bb96ac58fe1b8c5f0597b467991020466451eef1', 1800000137000, '20260823T170000_retire_duplicate_reminder_delivery_journals');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (917, 'ed807be299c3b079efbde71692ade1fcc40e1b74cd0237135fc9e34cba4727b5', 1800000138000, '20260823T180000_operator_delivery_queue_health_excludes_reminder_not_dispatched');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (918, 'ea1461c129960511b647b6c7dd3cf3eb5887c848eac263feb10e0868bc646778', 1800000139000, '20260823T190000_email_auth_find_email_challenge_for_confirm_forward_repair');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (919, 'b9c6d2ecffc877baf753cb102f7a31ec6d0324b165b99baadb74659d831cdde9', 1800000140000, '20260823T200000_retire_support_delivery_events_and_content_access_grant_retry');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (920, '7f0f69c3aaf40222d9fbd920106c9aba94085d0b5836527c26dcd51eb7fde28e', 1800000141000, '20260823T210000_db_journal_retention_targets');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (921, '1a4679655489500b12ae877c5776d29baa6cb6b2a3b2b0e75054cd528a1cb5b4', 1800000142000, '20260823T220000_consolidate_reminder_occurrence_stores');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (658, '7d11b93eb91304089c6f557d847c86809252db9a6bad5f3ddd3383fa81eb1871', 1800000088000, '20260821T060000_close_saas_isolation_test_scenario_definer_seam');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (785, 'bd37eed68c2b2fc5a5973a3d2564d4fa6221853398e134828bae891470372317', 1800000116000, '20260822T200000_patient_demographics_leave_the_actor_root');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (619, '7f78a9b99869994799081d8cd17282adc0e7850d818509201353a57b85bf1091', 1800000071000, '20260819T204355_a_seat_invoice_is_not_cancelled_it_is_reissued');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (620, '66db5bf7824af292e1a0ec2fc5bac40c76c602a03cf248098f19d1f5b93369dc', 1800000072000, '20260819T205420_the_transcode_queue_dispatcher_had_no_door');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (621, 'd6b739a9e3c12bb5a796c9b1ac9298bb82f634ea3fed17866e02e566711292cd', 1800000073000, '20260819T210005_a_clinic_is_billed_for_seats_not_for_people');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (786, '04a32f707820081602d8412e5cd03807406363455a0eb7b3b79e435975965974', 1800000117000, '20260822T200000_tenant_definer_roots_validate_their_organization');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (787, '38b33cd3336299c38e435d23e306b14ae699a452135fba90a280fd8bdfd19cfc', 1800000118000, '20260822T210000_drop_stale_public_booking_enrollment_signature');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (788, 'b681480f7a5e55cdb40e30f87b76d5ed541d201494ff843b6384f749efe57e74', 1800000119000, '20260822T213000_drop_dead_integrator_content_access_grant_root');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (793, '2285f55d2e22d7fd7cf06670563bb982b3ab0f391bdcd86addcc5806cf42af71', 1800000122000, '20260823T011000_reject_numeric_organization_slug_claims');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (763, '6473c4e8b774628dbfaa89a3a9119fdb00529343482e306c7e8b381c22192658', 1800000109000, '20260822T150000_the_integrator_readers_get_named_roots');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (764, '617fd7ff7360276aa155c3140d8cf19cb0b5a930561410f0de6b82c5fbfaa410', 1800000110000, '20260822T161000_the_platform_user_stats_screens_read_an_aggregate');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (765, '797c493a21eac9cba7265650ea1c36d3010bf3555938bcf8baf56e73c15041c5', 1800000111000, '20260822T173000_the_product_analytics_screen_reads_an_aggregate');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (998, '3471c5ba2bcce1727efbe6edc05d19c4b3f77acbd8a8592c6e9291b17b80377c', 1800000143000, '20260824T010511_preserve_conditional_clinic_sender_scope');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (999, 'f3bc7ad5e182f97e9e3ef6b7400144fc4ef01c2ef03628ea87f48628db2246a0', 1800000144000, '20260824T021309_retire_orphaned_email_otp_enqueue');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1000, '8565cd58a9af4aa4b1d22f7c6156000c1bb0e81ffc4683056691cd4f59ba1bd4', 1800000145000, '20260824T053353_reconcile_clinic_delivery_credential_root');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1001, 'c79b5199030bed7b364fd88a0b0cbe30ef0454e79ce0c00fae49cabbef606899', 1800000146000, '20260824T064008_apply_surface_auth_owner_defaults');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1002, '84361b42faaae27c4544fcd0e343ccfd3d10e92c02b3df2f8cbc31fb76d8e5b9', 1800000147000, '20260824T120000_make_system_settings_single_root');


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

SELECT pg_catalog.setval('drizzle.__drizzle_migrations_id_seq', 1002, true);


--
-- PostgreSQL database dump complete
--

\unrestrict 0e3eaa0510279075d7a98a0c39483f5c73b06e0724043adca0d1963182a26f3
