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
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1448, '540e95c913e92dd5fc849b6711890e53d0b3847bb48c3145ad54430b468692de', 1800000166000, '20260827T183500_journal_retention_covers_reminder_history_and_message_log');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1450, '3f34a52bb8e991494c1d08a19c71bf015aea560c017bfc417b2a1f935f1c1a53', 1800000168000, '20260827T185000_operator_delivery_queue_health_exposes_confirmed_by_channel');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1451, '7099d5b83596a461107efa10a13f21b7623d5af4ad667968f8ee9831d45aff30', 1800000169000, '20260827T205400_hosted_video_covers_live_in_our_storage');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1452, '66c3de317745686e0af0d2141266b970a95ee9d3dd92605f11fd309bad694b4b', 1800000170000, '20260828T000247_close_operator_push_and_media_capability_gaps');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1453, '2f025a133f6cebcffbbea38aeec0643a7440d24f41a08ceef06c901217d6475a', 1800000171000, '20260828T011302_make_media_purge_one_leased_database_door');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1454, '7709a24427777811f68c90f5ce5946f1885cf569a43ae917a28b3819691f67f4', 1800000172000, '20260828T085822_anonymise_audit_actors_on_account_delete');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1455, '01dcb41e28792f1571bb13f37b54820f0f7ba8cbc6ac44627cb2b96988685de0', 1800000173000, '20260828T092521_deliver_cron_isolation_operations');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1456, 'eb63467323fc719ddac25c1aec1e0d3c9d0a6134196f89ce39cb315626261782', 1800000174000, '20260828T131900_organization_purge_reaches_every_named_class');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1457, '6cf5175b6815dc5b4dda49167b8d18ba181242c40ad83d06e380bc9f1c5252ed', 1800000175000, '20260828T160000_reminder_rules_belong_to_the_canonical_person');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1458, 'c8fdf48da3eca05a0f810babbd2fb5dca249c736c6a4279de53256405a80728d', 1800000176000, '20260828T170000_retire_public_integrator_identity');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1460, 'd06dde0a6ca51c0313bd1ccc26ddf102a87d5574b41ad35fdc0220d578b79118', 1800000177000, '20260828T165000_disable_unowned_reminder_rules');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1462, '69ae23c1f21a5c92e9733117f01b8e7799fee260214f37dac4882d34959fc500', 1800000178000, '20260828T171000_sync_curated_health_with_background_job_manifest');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (629, 'b301d1dab844a86f624943881ecf999d689bddcb32ad8c440409cee2905edc8f', 1800000075000, '20260820T100444_direct_public_write_retries');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (630, '21700c35b550f6ca3fcf59a1a6589c02f882962645ee895f28abc60d984e7c23', 1800000076000, '20260820T112313_reminder_occurrence_delivery_capability');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (631, '24385d07cae4fb9b7504135dc80d9446d5a43d2a34a894997baa8ecfaed412cc', 1800000077000, '20260820T114223_appointment_bound_patient_payments');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (632, 'e3972e0e3c0a93eb00ec6600a75a065b01d4f4ab3e19f5b996b9b47d525063ce', 1800000078000, '20260820T122628_direct_public_write_retry_org_invariant');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (634, '63aedb1f4c3eabb3b4e8459da305a0a8c4dc8a596dfcb07b11f6b9f35e17d76b', 1800000079000, '20260820T175432_paid_period_global_access_authority');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (636, 'd7bbe891be7ac15b895ec6ed7aa3c6b884a005c6032705dd17b4cfdea1106109', 1800000080000, '20260820T185707_the_delivery_journal_accepts_a_nonqueue_attempt');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1476, '08ece7ed8eb65abf3f27580516e2f4a8082ae230c19b8389bd7dde54ff5e02c5', 1800000182000, '20260829T053839_list_configured_custom_domain_hostnames');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1477, 'd6d4920559345df49307652e295be4a0ec0eaf2ff88270dcd72714ca15a31005', 1800000183000, '20260829T125604_delivery_backlog_age_starts_when_delivery_is_due');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (643, '99098bff2eef013ff3b12ece21196820dbf3c544987bbd47406f75e550f0f708', 1800000083000, '20260821T002100_move_outgoing_delivery_retention_to_producer_root');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (645, 'ff3a4320be5e89f1a4c58a0ef77933e64a19729e399a3c3fbc5f9102ab7e4065', 1800000084000, '20260821T003000_cut_over_delivery_attempt_history');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (647, 'd2c07f2853a96dc0d5662b855bf0390c33f0f5ccc4ef2a11206bcb8a93afcbf9', 1800000085000, '20260821T025935_restore_reference_catalog_baselines');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1013, '061e9fe147b3aa6fcef557cb9bd63353a7bf9032325e1ab9873946934db9c90b', 1800000149000, '20260824T154700_derive_public_oauth_availability_at_read');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (791, '40069ca47c4a5bd05472d15e34c6256c80728022d4dc8a6df8754ba5df4f69b4', 1800000121000, '20260823T010000_patient_subdomain_slug_and_custom_domain_uniqueness');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (795, '369ae3b27840483769d4f6c584f6ffce2ce74a55f541bfb00516d042086ce864', 1800000123000, '20260823T010000_mail_profile_reaches_auth_delivery');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1481, '26387213a61ed0c78745774528d128cd53654f9f541e78f0bde2ca78929f3f60', 1800000184000, '20260901T231600_a_downgraded_capability_reads_its_own_tariff_policy');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1023, 'c11dc2bfca8bc3ad942cec0db1c60381b9e85e3d1a129fccd5d48bf90e6066aa', 1800000152000, '20260825T084524_close_live_acceptance_runtime_roots');
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
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1025, '3b7932ec362c02639a7ca900c51336dba2751d98cba812c75ad296803b6b33d2', 1800000153000, '20260825T124133_make_patient_archive_clinic_scoped');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1027, '7ed143f49f4d03bc6a3593419dae040ff0aa01369571c66f543baac28165e0b6', 1800000154000, '20260825T124849_blocked_accounts_cannot_enter_by_phone_or_messenger');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1029, '95844a607f9314deb2ec33b2748a2f9b472091ac35f9a5912de84ce3066beacc', 1800000155000, '20260825T125238_blocked_account_cannot_create_public_booking');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (829, 'c4fc774b7c7f30109f57d05fd1432a5785277d09578f64ddfddbbf0206a3a678', 1800000128000, '20260823T030000_integrator_tenant_role_reaches_delivery_roots');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (830, '04a951d2b04c0ef99dea79192e8386498457b2ddab8ceb5f178f8e7e3253cf46', 1800000129000, '20260823T035715_clinic_platform_integration_availability_door');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (831, 'fcc98677f8fea4aae5fd22e332325e413ee2285887aa4e9de94bb1df46766954', 1800000130000, '20260823T101403_align_organization_slug_claims_with_address_policy');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1111, 'd9a54d7d1aca7510430a9acd4a133cf8f2c152eee1800748aa93d5b8e1c90cc5', 1800000158000, '20260826T012325_cancelled_appointment_reminders_are_not_failures');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1112, 'ee1f2698b682604f406c70ac7b264479d144f3773d2e27ac476cc60c6b1e7d7b', 1800000159000, '20260826T073517_materialize_patient_reminders_by_canonical_user');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1113, 'a327e0b135c0514edbc8ec2911680579f92e66a20a0c39d892ca526906da67d9', 1800000160000, '20260826T091635_allow_staff_to_cancel_patient_reminder_occurrences');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1114, '9f884d180be2c9f7f9646e9acc8430388dd14d41a9dc8751a4629ac5846eb4c4', 1800000161000, '20260826T115100_fix_lfk_child_owner_trigger_record_shape');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1115, 'c89dd63bb350dc3deaf20cebbf7d9e49b15265a9d54fcef03a554afcb21226a4', 1800000162000, '20260826T140000_platform_support_and_public_booking_merge_doors');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1116, '3e6cf697ae00dc99e2244b144c42afcf602c45f5397b7e535c6c566a0d1d527b', 1800000163000, '20260826T141536_retire_user_phone_link_named_roots');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (585, '228d8d4d652bca0248b084e6d69d5ee59dca3c8eb6108f9eca339f38de4c49dd', 1800000060000, '20260819T180713_a_lifetime_allowance_counted_by_join_is_not_lifetime');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (587, 'ba4a69129732ff76f639cf0459697fcf9e13b59a3a77069c0fe7496880492b9f', 1800000053000, '20260819T170216_a_public_visitor_becomes_a_client_when_identified');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (588, 'efdb857d09bcf0f22b53737b36fa639cbb09a49099e4f45f67568c6e47426914', 1800000055000, '20260819T163536_a_failed_public_booking_must_not_leave_a_client');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (589, '556c698a61df85ef709c67c4959fd5861143d1119c0237787bee0a61374dbfc8', 1800000056000, '20260819T182039_a_visitor_booking_spends_no_tariff_seat');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (624, '83df3f21ecb97fa497a471dea38f88806c5138cb2cb6d9e33d6c5da2a5e6ea25', 1800000074000, '20260820T010127_the_platform_admin_could_read_org_active_but_not_flip_it');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (640, '4fc3377305f80c7460af9c73a2fa1a7c0f8227a143068138ca4406fcb303789b', 1800000081000, '20260820T210709_retire_projection_outbox');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (641, '4143e15d93ba7fdecaa3a33b4b5670f678fd58c0b55306e87960a76890c6daae', 1800000082000, '20260821T001200_parameterize_integrator_outgoing_delivery_enqueue');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (653, '592a26046f44465bd0e9bd5a59aa1839e0e6a8b78ee17c84d246d4c4f9cb447d', 1800000086000, '20260821T040000_cut_over_canonical_contacts');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (654, '09ca1666e98a9172155163d63a23a82bd123f699881a832f89a15b39bdd0ac9a', 1800000087000, '20260821T050000_add_vk_messenger_settings');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1007, '29a1663ceefbbcac5b8270bae3691cf6a2cb8b8523249ca5c459ce8908ace437', 1800000148000, '20260824T150500_derive_public_sms_fallback_at_read');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1484, 'cd0c8036853f6d6543b77a6c0ec8bfb8de9151807510d2d43cf11ff2f30dcc22', 1800000185000, '20260902T015419_filter_pending_email_challenge_by_purpose');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1020, '367bed59416bee23e8c8ccf784708b50ea92024b4c0a156f434567820526dc46', 1800000151000, '20260824T182946_seed_doctor_today_preferences_fallback');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (682, '40d77e5fc76e8202f9372d9dd4af17d080d3ed7a883728a3126acf656037dc10', 1800000092000, '20260821T100000_platform_integration_availability_gains_vk');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (799, '17d0e6ec0a216a9b354f6df3f567744c38b3886387227dc231ddcbc5cff34a3a', 1800000124000, '20260823T002500_pre_session_login_uses_two_named_doors');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1035, '3dc759d8c5dd47cafeb6919407f983e5f68bec7e868bf5de65a247960cfcbe2a', 1800000156000, '20260825T175916_seed_booking_runtime_defaults');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1036, 'ecc2932a88418bf0b6d1e4ebc2033eeb3fc0d0955fb64545ccee75163f048a80', 1800000157000, '20260825T184132_restore_archived_relationship_after_failed_booking');
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
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1117, '0b959b25b4a6c2d30dfadc1c4803297ec9e4b6a15e210bcb9ccfe3ac5a237814', 1800000164000, '20260826T170000_limit_notification_delivery_attempts_to_provider_failures');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1118, '0cbb3a3f74b6ee662881c092898d1736aceb51eb04a5327cb0c28f80802eeb30', 1800000165000, '20260826T215857_move_environment_modes_out_of_system_settings');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (658, '7d11b93eb91304089c6f557d847c86809252db9a6bad5f3ddd3383fa81eb1871', 1800000088000, '20260821T060000_close_saas_isolation_test_scenario_definer_seam');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (785, 'bd37eed68c2b2fc5a5973a3d2564d4fa6221853398e134828bae891470372317', 1800000116000, '20260822T200000_patient_demographics_leave_the_actor_root');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (619, '7f78a9b99869994799081d8cd17282adc0e7850d818509201353a57b85bf1091', 1800000071000, '20260819T204355_a_seat_invoice_is_not_cancelled_it_is_reissued');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (620, '66db5bf7824af292e1a0ec2fc5bac40c76c602a03cf248098f19d1f5b93369dc', 1800000072000, '20260819T205420_the_transcode_queue_dispatcher_had_no_door');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (621, 'd6b739a9e3c12bb5a796c9b1ac9298bb82f634ea3fed17866e02e566711292cd', 1800000073000, '20260819T210005_a_clinic_is_billed_for_seats_not_for_people');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (786, '04a32f707820081602d8412e5cd03807406363455a0eb7b3b79e435975965974', 1800000117000, '20260822T200000_tenant_definer_roots_validate_their_organization');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (787, '38b33cd3336299c38e435d23e306b14ae699a452135fba90a280fd8bdfd19cfc', 1800000118000, '20260822T210000_drop_stale_public_booking_enrollment_signature');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (788, 'b681480f7a5e55cdb40e30f87b76d5ed541d201494ff843b6384f749efe57e74', 1800000119000, '20260822T213000_drop_dead_integrator_content_access_grant_root');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (793, '2285f55d2e22d7fd7cf06670563bb982b3ab0f391bdcd86addcc5806cf42af71', 1800000122000, '20260823T011000_reject_numeric_organization_slug_claims');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1017, '9591fc5596a188e6f9ee63237f6e44e328fabe941efc31ac8e0549467d02b864', 1800000150000, '20260824T162826_seed_unsupported_client_fallback_setting');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (763, '6473c4e8b774628dbfaa89a3a9119fdb00529343482e306c7e8b381c22192658', 1800000109000, '20260822T150000_the_integrator_readers_get_named_roots');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (764, '617fd7ff7360276aa155c3140d8cf19cb0b5a930561410f0de6b82c5fbfaa410', 1800000110000, '20260822T161000_the_platform_user_stats_screens_read_an_aggregate');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (765, '797c493a21eac9cba7265650ea1c36d3010bf3555938bcf8baf56e73c15041c5', 1800000111000, '20260822T173000_the_product_analytics_screen_reads_an_aggregate');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (998, '3471c5ba2bcce1727efbe6edc05d19c4b3f77acbd8a8592c6e9291b17b80377c', 1800000143000, '20260824T010511_preserve_conditional_clinic_sender_scope');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (999, 'f3bc7ad5e182f97e9e3ef6b7400144fc4ef01c2ef03628ea87f48628db2246a0', 1800000144000, '20260824T021309_retire_orphaned_email_otp_enqueue');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1000, '8565cd58a9af4aa4b1d22f7c6156000c1bb0e81ffc4683056691cd4f59ba1bd4', 1800000145000, '20260824T053353_reconcile_clinic_delivery_credential_root');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1001, 'c79b5199030bed7b364fd88a0b0cbe30ef0454e79ce0c00fae49cabbef606899', 1800000146000, '20260824T064008_apply_surface_auth_owner_defaults');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1002, '84361b42faaae27c4544fcd0e343ccfd3d10e92c02b3df2f8cbc31fb76d8e5b9', 1800000147000, '20260824T120000_make_system_settings_single_root');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1465, '2baf6e2d603cd3e5da5904ec084e884088025dcb7c584d795ad2c03b7ba88509', 1800000179000, '20260828T222317_operator_health_digest_reads_one_bounded_window');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1471, 'cc53b0c200bf2d2d16bfd08dbde628442919584791ac8916bcdda8b7f4bdcf18', 1800000180000, '20260829T010431_operator_health_digest_names_incident_direction');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1472, 'b33391e86230d4c3c2f25755206cb555a59078d9bf858c9df14b195c7af8e168', 1800000181000, '20260829T031736_resolve_provider_incidents_after_delivery');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1673, 'bd5a7b73eb44810db38b87ef96091a23e807599afbbc27209e713aef001c1dda', 1800000225000, '20260908T120000_appointment_delivery_format');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1680, '511c6a2a0463e342bf594afbe18e143271e141b2a85092b3c729f3bf2d0adbb7', 1800000227000, '20260908T135314_video_guest_reads_organization_access');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1847, '68e039901c6454be2ac352c7ab97c38c1419a875ef11d19623576635fc711a2d', 1800000271000, '20260912T110000_the_catalog_child_gets_the_same_owner_guard_as_lfk');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1492, '3f49556f7a38aa29b972bb62c2f85daa63783e5bec0836acb92068876913ad8d', 1800000186000, '20260904T020601_a_staff_membership_sale_is_one_idempotent_money_event');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1848, '9d4dc284a5dd04ed4a192e24b830b2f42de9374246e46e65cdd9f1370721bca1', 1800000272000, '20260912T150000_the_phone_history_belongs_to_the_person_not_the_clinic');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1494, '9b80a89026962c1d972918d9799f9857fb864a4919ab8389da649e0b46de7949', 1800000187000, '20260904T123504_specialist_task_date_only_deadline');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1849, '523c7a9283099214c6ce4ba61cac381b6b0e0017363572baa40a8f36ec8cd425', 1800000273000, '20260913T090000_the_branded_address_always_opens_the_app');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1850, 'a6c7577abd32ae26c6651d6c7bf5ab853758237033df0f23a77c5ebd9c68aa81', 1800000274000, '20260913T091500_the_branded_clinic_leaves_the_shared_list');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1498, '5258baee25bbac74097135f80e276a6db2da8f7c902c19b736521b12b7263041', 1800000188000, '20260904T230000_the_acquiring_callback_settles_under_its_own_tenant');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1592, '954ede20dc4d90a620ee6aa7ecdec7697fbb03c35853657c646200b14136db0d', 1800000200000, '20260906T190000_a_stored_file_carries_the_store_it_lives_in');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1501, '500f230490c0b7ded13660a4cc0c8456a7a4aea2ee116d136ad0a51b64829620', 1800000189000, '20260904T170000_delivery_is_the_media_not_a_setting');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1593, '637b1edc243b78802a125c6a10d956bf49718d0e84b59d4e5e1d22f76404029a', 1800000201000, '20260906T191500_a_patient_submission_is_stored_encrypted');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1595, 'aebe43770556adb3c72b272e5a3286dc6ed510c1450f5ea725e882551cb35ad7', 1800000203000, '20260906T194500_a_transcode_job_names_the_store');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1675, '17b50eff963368871eef6f443eda7f80ccf89cf92b61dd47f0a82b9f8d866216', 1800000226000, '20260908T132630_video_guest_exchange_accepts_named_context');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1510, '01cc2b8b1cdcd37748bcfc9b40f4b861576c3d5db45740e96a809899962e2795', 1800000190000, '20260905T194500_the_booking_payment_webhook_settles_under_its_own_tenant');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1787, 'a8f44faa9d3ea3310a534581072efe6b8c5e70cba9585aa03a9ac534c62b3559', 1800000253000, '20260911T220000_the_booking_link_narrows_to_its_specialist');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1788, 'e7c89556bed62a106abf2fbdd1dae18987c7b5e4602bf096992608eb7b50b75d', 1800000254000, '20260911T221000_the_clinic_root_stays_an_entry_when_the_card_is_off');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1513, '2195542b39432572232d742b2fbe95423ca0389aea03a3f85d0f71d9e38d2714', 1800000191000, '20260905T120000_one_global_billing_period_price_matrix');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1597, '63176279ef437972924112740f635f199434408baf8168ab4d1e572f2b578837', 1800000204000, '20260906T213827_booking_form_uses_one_active_flag');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1517, '87dfeac35d62f2f2996fc39ded998f3381abef46f17e939dc65e7694e10541dd', 1800000192000, '20260905T233449_clinical_entries_can_be_recorded_outside_visits');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1747, '798c4570503a08b24f0f6a317a75d409e4d4078d92d0be17392f55a7ed2ac2b6', 1800000228000, '20260909T120000_native_push_targets');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1748, '20295993d4a7c4d0757862ff9b7494b651970809f0a80e73ffc874871694c270', 1800000229000, '20260909T190000_platform_delivery_audience_credentials');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1749, '9dade5000e5e47966f2d685f3529274423bfb9b91c268fc8f9dc75215fb2d767', 1800000230000, '20260909T200000_custom_domain_staff_intent_door');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1750, '5d92a8e44b2a05f4a03565dbae371a4559fa2f1dae36b57ffbad9f1fda180b11', 1800000231000, '20260910T010740_operator_health_mail_settings_capabilities');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1751, '30aefbd1f48d0d4fc10e872012dcdea879bea5c8252511824ebea5151daf2c57', 1800000232000, '20260910T023451_allow_same_org_custom_domain_reclaim');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1752, 'd4f5d1e934bc448773299f81169737c4e1fa3b1c910cfa97cdef30bbd0a10c4d', 1800000233000, '20260910T044122_fix_custom_domain_root_entry_scope');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1753, '857947ce5ccf3ee332f26f9db460570e3f86a6aea1cf6a9ff2a5fc534c13837f', 1800000234000, '20260910T100000_platform_organization_brand_domain_projection');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1543, 'd7dad40c9533eac70e33f2a7d9b1be025b611af53ddcbc58ace342b4cb491916', 1800000194000, '20260906T025405_the_disease_anamnesis_is_one_replaced_text');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1544, 'f2018931ba0505ac6dc0291b107d6dc8e23858aed12481b6347c16cae96abe0b', 1800000195000, '20260906T101500_cash_settles_an_appointment_prepayment');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1755, '57032c3d3590ae03b68d1fd7ef0811fff587dca3938f63e258a97accbb4a068e', 1800000235000, '20260910T103638_patient_home_block_icons_live_in_the_repo');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1757, '509dcff8bc1ae92b0136a2e742e4ebc125579c80bcb6ecf1ac1ef1ce6564525d', 1800000236000, '20260910T113500_clinic_app_icon_is_a_brand_field');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1758, '016b8f60a72b19bc11254deff31bd0c103d1f296607297ca0b2242ceffccf78d', 1800000237000, '20260910T142000_the_cabinet_mode_is_a_tariff_property_not_a_seat_count');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1759, 'b377ccfb7e12576ffdbc6b3777e827bb71505f65ac8b1db5d60b2d27867997ed', 1800000238000, '20260910T160500_storage_usage_counts_everything_the_account_uploaded');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1760, '8d4b366133246bb59ddfc27e77cb80b1be90461b90bd605cc23a531e43b0f097', 1800000239000, '20260910T173000_storage_packages_are_a_platform_catalog');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1551, 'ae3d7031ca8bd8de691fa5c9cc299dc9a00a6172cf9d82e8709080d37d550c65', 1800000196000, '20260906T030953_add_booking_availability_horizon');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1761, 'dff0ed184b9e17b9a1fa31e12566402bb05c66c43613199502a0c59da9da25a6', 1800000240000, '20260910T193000_a_purchased_storage_package_lives_on_the_subscription');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1762, '106522f0bbb7365643ca2cb3fe4a94f4c402ff9568a93d639926caad46338167', 1800000241000, '20260910T210000_a_storage_package_invoice_is_a_prorated_purchase');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1763, '717c32f45b9a266bbe8cc3181d40ffaa3306502626782ee5483a9fb82ee0c259', 1800000242000, '20260910T223000_the_renewal_invoice_carries_the_storage_package');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1666, 'b01f66a1b6a3d4a5dc91b4165d00ba32c53de51e43c69f26d912969abd807fbd', 1800000221000, '20260827T184500_delivery_health_reads_success_from_canonical_queue');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1667, '93a3ca11a90a1577504696f2a71c96380c163df6b2673ed31e036cd2a04f725d', 1800000222000, '20260905T233000_an_appointment_owns_its_price_and_prepayment');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1668, 'ae8561f58c0121c84918e7e50c87fd98706f9a10c00ef7f1eb49dfd45426bcb6', 1800000223000, '20260906T193000_a_delete_lease_names_the_store');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1556, '9783282fcce23ef9493258a849dc0b2af34d7a3061c844f07d37f113e5a20593', 1800000197000, '20260906T110000_an_overlap_stands_only_where_a_specialist_confirmed_that_slot');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1561, 'c97679382b48d362a1a9fefb1b629dd77486d24820228d9f2cd5cd435fc76f6f', 1800000198000, '20260906T140000_patient_booking_rows_carry_branch_timezone');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1562, 'e9c50da42fd1f1f002f0d5625f754c269a13a02f0268d8b9aad99f48e647e831', 1800000199000, '20260906T153947_staff_can_read_booking_prepayment_wait');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1611, 'bec242e8c38f3c51a87b69b4d4b6d77a62c036f332a65ca5ff14f9198f19b24a', 1800000205000, '20260907T021938_doctor_patient_support_is_organization_scoped');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1612, '36296ade77c1355cd80e37486eb2d4ffcc27f08ea70784e675dcf803abb6c2af', 1800000206000, '20260907T113850_patient_reads_workspace_composition');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1798, '37c8cf6da889cdfa1eabc2cfb7c6b0cc13949f58fd3f2bff94d73a3406524e7f', 1800000258000, '20260912T000500_the_database_knows_every_reserved_public_root');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1799, 'a7e1ccdc42aa32df0adfbc7369afaef1c11a75466ce73e47fcfff9b0e971038a', 1800000259000, '20260912T001500_the_address_snapshot_leaves_the_clinic_card');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1621, '95c9a637c1aefa1b37c28f33b34463c77927134502ec77b29eb0649c57448c34', 1800000207000, '20260907T090000_org_custom_domain_binding_core');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1625, '6988d1539162cd66f9f8181aaa7f943917bfe5c5aaa3955a78514102b192a60b', 1800000208000, '20260907T120000_doctor_patient_support_direct_chat_override');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1626, '22e16de4ef567ce743113f49330570fcce512feed5ab38c94c473d74f7dc9ebe', 1800000209000, '20260907T150000_patient_reads_workspace_client_defaults');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1628, 'e4c496e7c5608a1841ea8eb2e0eea54b4c1f6558d1d6f21d4524dc73a430aab0', 1800000210000, '20260907T180000_c3m_portal_policy_and_patient_symptom_tracking');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1630, 'fd3dc13ce4c33004c3f653df07892e7ec48eaf29c4db51d7e5a7c6e96b08ab93', 1800000211000, '20260907T141500_clinic_membership_clinical_permissions');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1648, '72b24800a9953dadac37530408da2d4d5849b2b36e6e2b89aac24f417ed2a9f3', 1800000215000, '20260907T185502_reminder_callback_returns_organization');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1649, '3e8d2703ec2b4ea2da9ed21f45a7b5a141554199a852459cf0fa1e2fe08183b5', 1800000216000, '20260907T214444_disable_staff_passwordless_channel_defaults');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1650, 'b62ab4339e91013e1c44384f432c8a58d03609d54fa646d108c6a4a8300fd7e3', 1800000217000, '20260908T011055_patient_reads_patient_label');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1810, 'fc1c0f0c8febf04e9354c2234460d18b3fce09002f5eb8cff783589ca8066910', 1800000262000, '20260911T211321_tests_recommendations_platform_ownership');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1663, '695ad3ff1ad249e23e8ff2982650ec611692059ed8adc624793e4df729dd7ce1', 1800000218000, '20260908T033000_video_meeting_core');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1664, '54953b07fbaf14aaf93292ec7ab493eaeb2bb7bad6ccd9fb1357cc728bfadd90', 1800000219000, '20260908T033001_daily_doctor_notes');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1665, '993320e406fcbaee2229a4ff36f5ea444527bd1814805173905bc91adbaf9e2a', 1800000220000, '20260908T104500_clinical_complaint_links_patient_symptom_tracking');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1670, 'f698fc2c8114f72a97d4d2b642b3a8e4376be4b807039d8a8923855aae3f5eea', 1800000224000, '20260908T074414_expose_jitsi_provider_settings_to_runtime');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1816, 'ce371d4ed6a3c28217ab8642926c911a03ea075c33e0ea4aafb08736d36d2c07', 1800000263000, '20260912T010000_the_open_retention_windows_get_their_numbers');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1819, '61cd940d96c67df509cc9898209102ef7756d913a01aef197608da4aa904fe0d', 1800000265000, '20260912T002000_expired_prepayment_cancels_patient_booking');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1823, 'a47b0b53a80ca16a21789633cc904cd92e177a539b6bcd9517fa56f5f41c5f3c', 1800000266000, '20260911T233000_patient_reads_own_booking_payment_status');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1790, '72e3f577f53c84dbf20d70d54ee1058751fde5afde87010f75392c26aa2aa247', 1800000255000, '20260911T230000_a_service_is_enabled_only_when_somebody_does_it');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1765, '06676d348900972b8e8c47f0ab647372f995ae909da17ff049c3c27163e97cea', 1800000243000, '20260910T223000_a_claimed_preview_row_says_so');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1792, 'dda7939158347db53b9c0b3215607ab803f8fc0dce6f67d003e9fd36a6cb88c2', 1800000256000, '20260911T234500_the_card_switch_stops_closing_things');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1767, '7f8e015047803d345e9e35211207c30ec951e18eea5fac6db1c21c71121f3c3d', 1800000244000, '20260910T233000_an_invite_opened_by_its_own_patient_needs_no_second_proof');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1797, '34f496e999e17bf9bbeb40ff6ce7fe3decb9ddc4ee4c7867972f43af671d9769', 1800000257000, '20260911T235500_the_clinic_card_shows_the_name_the_cabinet_edits');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1808, '3d9b0401de7c9108845a0f0be88aa207e0c2fa9763ef054477c1219e6b9f5bcc', 1800000260000, '20260911T200000_daily_delivery_byte_metering_and_source_bitrate_column');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1770, 'd6fb9d7b037e473198a72411e7770ad512d5fe9b30dc1b6e80fc8b43881acd70', 1800000245000, '20260911T003000_the_invite_doors_are_pre_session_not_patient');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1771, '24c7e9018b6618f601c4e64d6fef05cddac5613cbd3effc9189939a2d53c71dc', 1800000246000, '20260911T010000_the_redeem_doors_read_only_their_granted_columns');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1772, '70afdb737a6fdfc0d9795e6cc4c27af5c108e0c26fdb4b6261796e442363376e', 1800000247000, '20260911T020000_invite_proof_doors_stop_re_signing_what_the_port_binds');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1773, '5fa8d10623178a20d58a8a565b7a671b0618e10d83255a4f1657361114f9e075', 1800000248000, '20260911T030000_the_invite_screen_learns_whose_clinic_it_shows');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1809, '7819ae17c8ca85bd19dd59518dd35ada2754146bddafc68b9a7b21279a1205f9', 1800000261000, '20260911T211513_a_payment_link_checks_its_invoice_before_opening_provider');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1776, '3cd8d9c61542f5a5fe084dfa0fdb6bd630cbc2873009c5f0d01c68c3a90a4c14', 1800000249000, '20260911T140000_public_clinic_card_reads_live_branches');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1818, '6af8b82946a5ffc5577eb2f236f05e9c84f0145eb314a8c8f64d0956bd2577f0', 1800000264000, '20260912T012000_the_organization_names_the_appointment_word');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1827, '9c0d4a5a173eb52bbe609862163fa84b77dbda80d763d9848f9881b015080caa', 1800000267000, '20260912T003000_public_clinic_media_requires_a_standard_rendition');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1780, 'e3ca33f23cea2ebb1562ed508b615dad57905e98653ca1bd9f7a9d695ed99a54', 1800000250000, '20260911T160000_specialist_public_card');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1828, '896b9e5e95c3f2da1941b0e10e5744ec24b1e4953644534448cda5db75e2ee77', 1800000268000, '20260912T003100_platform_media_exposes_standard_rendition_state');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1829, 'd1a79ac5bdf3b5f56c60a04465006c65bc09e82dc3cad087ad649e012733bf3b', 1800000269000, '20260912T094500_booking_runtime_integer_falls_back_to_registry_default');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1783, '3d5ea2b543dcb20e9eda648a37886f4de0e9ecb60c4d1cb248f33e55ec2bd8e9', 1800000251000, '20260911T080000_exercise_load_type_becomes_a_multi_select');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1784, '57e89c13ce32ed23e21f45af5ce3d6bd0fea166e5bf06cffaa53f4c16138168e', 1800000252000, '20260911T190000_the_clinic_card_shows_services_and_its_full_description');
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at, tag) VALUES (1831, '2d4756cd291db875792504b6cd5bb8c99f102ff0115159ae9c403d8c1e7dcd16', 1800000270000, '20260912T095500_booking_slot_snapshot_falls_back_to_registry_default');


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
INSERT INTO public.saas_tariffs (id, name, description, price_minor, currency, mechanics, is_active, created_at, updated_at, included_seats, billing_period, quotas, system_access_policy, mechanic_access_policies, downgrade_policies, additional_seat_price_minor, discounted_price_minor, mailing_templates) VALUES ('d1156dc6-e71e-4225-ad94-93c9d423c9e1', 'ПОЛНЫЙ ДОСТУП - РАЗРАБОТЧИК', '', 0, 'RUB', '{"promo": true, "booking": true, "courses": true, "warmups": true, "branding": true, "mailings": true, "payments": true, "cms_pages": true, "clinic_sms": true, "clinic_smtp": true, "clinic_team": false, "custom_domain": true, "subscriptions": true, "clinic_max_bot": true, "video_meetings": true, "exercise_catalog": true, "specialist_tasks": true, "doctor_statistics": true, "exercise_packages": true, "external_calendar": true, "booking_prepayment": true, "patient_home_today": true, "clinic_telegram_bot": true, "clinic_vk_community": true, "patient_app_paid_subscription": true}', true, '2026-07-25 20:15:14.807477+03', '2026-09-10 15:54:02.857+03', 1, 'year', '{"files": {"kind": "numeric", "unit": "bytes", "limit": 26843545600, "warningAtPercent": 80}, "branches": {"kind": "unlimited", "unit": "items", "limit": null}}', NULL, '{}', '{}', NULL, NULL, '[]');


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

SELECT pg_catalog.setval('drizzle.__drizzle_migrations_id_seq', 1850, true);


--
-- PostgreSQL database dump complete
--

\unrestrict 0e3eaa0510279075d7a98a0c39483f5c73b06e0724043adca0d1963182a26f3

-- Generated from SYSTEM_SETTING_REGISTRY. Existing source values always win.
INSERT INTO public.system_settings (key, scope, organization_id, value_json, updated_at, updated_by)
SELECT seed.key, seed.scope, seed.organization_id::uuid, seed.value_json, seed.updated_at, seed.updated_by::uuid
FROM (VALUES
  ('admin_emails', 'admin', NULL, '{"value":[]}'::jsonb, statement_timestamp(), NULL),
  ('admin_incident_alert_config', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('admin_max_ids', 'admin', NULL, '{"value":[]}'::jsonb, statement_timestamp(), NULL),
  ('admin_phones', 'admin', NULL, '{"value":[]}'::jsonb, statement_timestamp(), NULL),
  ('admin_telegram_ids', 'admin', NULL, '{"value":[]}'::jsonb, statement_timestamp(), NULL),
  ('allowed_max_ids', 'admin', NULL, '{"value":[]}'::jsonb, statement_timestamp(), NULL),
  ('allowed_phones', 'admin', NULL, '{"value":[]}'::jsonb, statement_timestamp(), NULL),
  ('allowed_telegram_ids', 'admin', NULL, '{"value":[]}'::jsonb, statement_timestamp(), NULL),
  ('app_display_timezone', 'admin', NULL, '{"value":"Europe/Moscow"}'::jsonb, statement_timestamp(), NULL),
  ('apple_oauth_client_id', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('apple_oauth_key_id', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('apple_oauth_private_key', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('apple_oauth_redirect_uri', 'admin', NULL, '{"value":""}'::jsonb, statement_timestamp(), NULL),
  ('apple_oauth_team_id', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('auth_altcha_hmac_secret', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('auth_email_enabled', 'admin', NULL, '{"value":true}'::jsonb, statement_timestamp(), NULL),
  ('auth_max_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_oauth_apple_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_oauth_google_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_oauth_vk_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_oauth_yandex_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_passkey_enabled', 'admin', NULL, '{"value":true}'::jsonb, statement_timestamp(), NULL),
  ('auth_sms_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_patient_email_enabled', 'admin', NULL, '{"value":true}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_patient_max_enabled', 'admin', NULL, '{"value":true}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_patient_oauth_apple_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_patient_oauth_google_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_patient_oauth_vk_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_patient_oauth_yandex_enabled', 'admin', NULL, '{"value":true}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_patient_passkey_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_patient_sms_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_patient_telegram_enabled', 'admin', NULL, '{"value":true}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_platform_admin_email_enabled', 'admin', NULL, '{"value":true}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_platform_admin_max_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_platform_admin_oauth_apple_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_platform_admin_oauth_google_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_platform_admin_oauth_vk_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_platform_admin_oauth_yandex_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_platform_admin_passkey_enabled', 'admin', NULL, '{"value":true}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_platform_admin_sms_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_platform_admin_telegram_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_staff_email_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_staff_max_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_staff_oauth_apple_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_staff_oauth_google_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_staff_oauth_vk_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_staff_oauth_yandex_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_staff_passkey_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_staff_sms_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_surface_staff_telegram_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('auth_telegram_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('booking_default_organization_id', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('booking_location_default_palette', 'admin', NULL, '{"value":{"physicalPalette":["#2563EB","#16A34A","#F59E0B","#DC2626","#7C3AED"],"online":"#7C3AED"}}'::jsonb, statement_timestamp(), NULL),
  ('doctor_max_ids', 'admin', NULL, '{"value":[]}'::jsonb, statement_timestamp(), NULL),
  ('doctor_phones', 'admin', NULL, '{"value":[]}'::jsonb, statement_timestamp(), NULL),
  ('doctor_telegram_ids', 'admin', NULL, '{"value":[]}'::jsonb, statement_timestamp(), NULL),
  ('error_tracking_dsn', 'admin', NULL, '{"value":""}'::jsonb, statement_timestamp(), NULL),
  ('error_tracking_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('google_client_id', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('google_client_secret', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('google_oauth_login_redirect_uri', 'admin', NULL, '{"value":""}'::jsonb, statement_timestamp(), NULL),
  ('google_redirect_uri', 'admin', NULL, '{"value":""}'::jsonb, statement_timestamp(), NULL),
  ('important_fallback_delay_minutes', 'admin', NULL, '{"value":60}'::jsonb, statement_timestamp(), NULL),
  ('jitsi_jwt_application_id', 'admin', NULL, '{"value":""}'::jsonb, statement_timestamp(), NULL),
  ('jitsi_jwt_issuer', 'admin', NULL, '{"value":""}'::jsonb, statement_timestamp(), NULL),
  ('jitsi_jwt_signing_secret', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('jitsi_public_url', 'admin', NULL, '{"value":""}'::jsonb, statement_timestamp(), NULL),
  ('jitsi_xmpp_domain', 'admin', NULL, '{"value":""}'::jsonb, statement_timestamp(), NULL),
  ('material_ratings_enabled', 'admin', NULL, '{"value":true}'::jsonb, statement_timestamp(), NULL),
  ('max_api_base_url', 'admin', NULL, '{"value":""}'::jsonb, statement_timestamp(), NULL),
  ('max_bot_api_key', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('max_login_bot_nickname', 'admin', NULL, '{"value":""}'::jsonb, statement_timestamp(), NULL),
  ('max_webhook_secret', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('operator_alert_fallback_email', 'admin', NULL, '{"value":""}'::jsonb, statement_timestamp(), NULL),
  ('operator_health_alert_config', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('operator_health_imap', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('operator_health_probe_config', 'admin', NULL, '{"value":{"max":{"enabled":true,"intervalMs":600000,"timeoutMs":5000,"consecutiveFailures":2},"telegram":{"enabled":true,"intervalMs":600000,"timeoutMs":5000,"consecutiveFailures":2},"google_calendar":{"enabled":true,"intervalMs":600000,"timeoutMs":5000,"consecutiveFailures":2},"email":{"intervalMs":900000,"timeoutMs":60000,"roundTripDeadlineMs":300000,"retentionMs":604800000,"cleanupIntervalMs":86400000},"quietWindowMaxDurationMs":86400000,"quietUntil":null}}'::jsonb, statement_timestamp(), NULL),
  ('operator_heartbeat_config', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('patient_app_maintenance_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('patient_app_maintenance_message', 'admin', NULL, '{"value":""}'::jsonb, statement_timestamp(), NULL),
  ('patient_home_warmup_skip_to_next_available_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('patient_program_discussion_doctor_reply_from_log_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('patient_program_discussion_media_submission_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('patient_program_discussion_ui_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('patient_unsupported_client_fallback_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('platform_integration_availability', 'admin', NULL, '{"value":{"version":1,"integrations":{"telegram":true,"max":true,"vk":false,"email":true,"smsc":true,"web_push":true,"google_calendar":true,"yandex_calendar":false}}}'::jsonb, statement_timestamp(), NULL),
  ('rustore_universal_push_therapygo', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('rustore_universal_push_therapysto', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('saas_billing_payment_provider', 'admin', NULL, '{"value":"yookassa"}'::jsonb, statement_timestamp(), NULL),
  ('smsc_api_key', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('smsc_base_url', 'admin', NULL, '{"value":""}'::jsonb, statement_timestamp(), NULL),
  ('smsc_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('smtp_outbound', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('specialist_signup_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('support_contact_url', 'admin', NULL, '{"value":""}'::jsonb, statement_timestamp(), NULL),
  ('telegram_bot_token', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('telegram_login_bot_username', 'admin', NULL, '{"value":""}'::jsonb, statement_timestamp(), NULL),
  ('telegram_mode', 'admin', NULL, '{"value":"long_polling"}'::jsonb, statement_timestamp(), NULL),
  ('telegram_send_menu_on_button_press', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('telegram_webhook_secret', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('therapygo_max_bot_api_key', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('therapygo_max_webhook_secret', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('therapygo_smtp_outbound', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('therapygo_telegram_bot_token', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('therapygo_telegram_mode', 'admin', NULL, '{"value":"long_polling"}'::jsonb, statement_timestamp(), NULL),
  ('therapygo_telegram_webhook_secret', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('therapysto_max_bot_api_key', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('therapysto_max_webhook_secret', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('therapysto_smtp_outbound', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('therapysto_telegram_bot_token', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('therapysto_telegram_mode', 'admin', NULL, '{"value":"long_polling"}'::jsonb, statement_timestamp(), NULL),
  ('therapysto_telegram_webhook_secret', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('video_hls_new_uploads_auto_transcode', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('video_hls_pipeline_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('video_hls_reconcile_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('video_playback_api_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('video_presign_ttl_seconds', 'admin', NULL, '{"value":3600}'::jsonb, statement_timestamp(), NULL),
  ('video_watermark_enabled', 'admin', NULL, '{"value":false}'::jsonb, statement_timestamp(), NULL),
  ('vk_callback_confirmation_token', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('vk_callback_secret', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('vk_community_access_token', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('vk_id_application_id', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('vk_id_client_secret', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('vk_id_redirect_uri', 'admin', NULL, '{"value":""}'::jsonb, statement_timestamp(), NULL),
  ('vk_video_service_token', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('vk_web_login_url', 'admin', NULL, '{"value":""}'::jsonb, statement_timestamp(), NULL),
  ('web_push_vapid', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('yandex_oauth_client_id', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('yandex_oauth_client_secret', 'admin', NULL, '{"value":null}'::jsonb, statement_timestamp(), NULL),
  ('yandex_oauth_redirect_uri', 'admin', NULL, '{"value":[]}'::jsonb, statement_timestamp(), NULL),
  ('doctor_today_preferences', 'doctor', NULL, '{"value":{"peopleListMode":"on_support"}}'::jsonb, statement_timestamp(), NULL)
) AS seed(key, scope, organization_id, value_json, updated_at, updated_by)
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_settings existing
  WHERE existing.key = seed.key
    AND existing.scope = seed.scope
    AND existing.organization_id IS NOT DISTINCT FROM seed.organization_id::uuid
);

DO $target_system_settings_gate$
DECLARE missing_keys text;
BEGIN
  SELECT string_agg(expected.key, comma.value ORDER BY expected.key) INTO missing_keys
  FROM (VALUES
    ('admin_emails', 'admin'),
    ('admin_incident_alert_config', 'admin'),
    ('admin_max_ids', 'admin'),
    ('admin_phones', 'admin'),
    ('admin_telegram_ids', 'admin'),
    ('allowed_max_ids', 'admin'),
    ('allowed_phones', 'admin'),
    ('allowed_telegram_ids', 'admin'),
    ('app_display_timezone', 'admin'),
    ('apple_oauth_client_id', 'admin'),
    ('apple_oauth_key_id', 'admin'),
    ('apple_oauth_private_key', 'admin'),
    ('apple_oauth_redirect_uri', 'admin'),
    ('apple_oauth_team_id', 'admin'),
    ('auth_altcha_hmac_secret', 'admin'),
    ('auth_email_enabled', 'admin'),
    ('auth_max_enabled', 'admin'),
    ('auth_oauth_apple_enabled', 'admin'),
    ('auth_oauth_google_enabled', 'admin'),
    ('auth_oauth_vk_enabled', 'admin'),
    ('auth_oauth_yandex_enabled', 'admin'),
    ('auth_passkey_enabled', 'admin'),
    ('auth_sms_enabled', 'admin'),
    ('auth_surface_patient_email_enabled', 'admin'),
    ('auth_surface_patient_max_enabled', 'admin'),
    ('auth_surface_patient_oauth_apple_enabled', 'admin'),
    ('auth_surface_patient_oauth_google_enabled', 'admin'),
    ('auth_surface_patient_oauth_vk_enabled', 'admin'),
    ('auth_surface_patient_oauth_yandex_enabled', 'admin'),
    ('auth_surface_patient_passkey_enabled', 'admin'),
    ('auth_surface_patient_sms_enabled', 'admin'),
    ('auth_surface_patient_telegram_enabled', 'admin'),
    ('auth_surface_platform_admin_email_enabled', 'admin'),
    ('auth_surface_platform_admin_max_enabled', 'admin'),
    ('auth_surface_platform_admin_oauth_apple_enabled', 'admin'),
    ('auth_surface_platform_admin_oauth_google_enabled', 'admin'),
    ('auth_surface_platform_admin_oauth_vk_enabled', 'admin'),
    ('auth_surface_platform_admin_oauth_yandex_enabled', 'admin'),
    ('auth_surface_platform_admin_passkey_enabled', 'admin'),
    ('auth_surface_platform_admin_sms_enabled', 'admin'),
    ('auth_surface_platform_admin_telegram_enabled', 'admin'),
    ('auth_surface_staff_email_enabled', 'admin'),
    ('auth_surface_staff_max_enabled', 'admin'),
    ('auth_surface_staff_oauth_apple_enabled', 'admin'),
    ('auth_surface_staff_oauth_google_enabled', 'admin'),
    ('auth_surface_staff_oauth_vk_enabled', 'admin'),
    ('auth_surface_staff_oauth_yandex_enabled', 'admin'),
    ('auth_surface_staff_passkey_enabled', 'admin'),
    ('auth_surface_staff_sms_enabled', 'admin'),
    ('auth_surface_staff_telegram_enabled', 'admin'),
    ('auth_telegram_enabled', 'admin'),
    ('booking_default_organization_id', 'admin'),
    ('booking_location_default_palette', 'admin'),
    ('doctor_max_ids', 'admin'),
    ('doctor_phones', 'admin'),
    ('doctor_telegram_ids', 'admin'),
    ('error_tracking_dsn', 'admin'),
    ('error_tracking_enabled', 'admin'),
    ('google_client_id', 'admin'),
    ('google_client_secret', 'admin'),
    ('google_oauth_login_redirect_uri', 'admin'),
    ('google_redirect_uri', 'admin'),
    ('important_fallback_delay_minutes', 'admin'),
    ('jitsi_jwt_application_id', 'admin'),
    ('jitsi_jwt_issuer', 'admin'),
    ('jitsi_jwt_signing_secret', 'admin'),
    ('jitsi_public_url', 'admin'),
    ('jitsi_xmpp_domain', 'admin'),
    ('material_ratings_enabled', 'admin'),
    ('max_api_base_url', 'admin'),
    ('max_bot_api_key', 'admin'),
    ('max_login_bot_nickname', 'admin'),
    ('max_webhook_secret', 'admin'),
    ('operator_alert_fallback_email', 'admin'),
    ('operator_health_alert_config', 'admin'),
    ('operator_health_imap', 'admin'),
    ('operator_health_probe_config', 'admin'),
    ('operator_heartbeat_config', 'admin'),
    ('patient_app_maintenance_enabled', 'admin'),
    ('patient_app_maintenance_message', 'admin'),
    ('patient_home_warmup_skip_to_next_available_enabled', 'admin'),
    ('patient_program_discussion_doctor_reply_from_log_enabled', 'admin'),
    ('patient_program_discussion_media_submission_enabled', 'admin'),
    ('patient_program_discussion_ui_enabled', 'admin'),
    ('patient_unsupported_client_fallback_enabled', 'admin'),
    ('platform_integration_availability', 'admin'),
    ('rustore_universal_push_therapygo', 'admin'),
    ('rustore_universal_push_therapysto', 'admin'),
    ('saas_billing_payment_provider', 'admin'),
    ('smsc_api_key', 'admin'),
    ('smsc_base_url', 'admin'),
    ('smsc_enabled', 'admin'),
    ('smtp_outbound', 'admin'),
    ('specialist_signup_enabled', 'admin'),
    ('support_contact_url', 'admin'),
    ('telegram_bot_token', 'admin'),
    ('telegram_login_bot_username', 'admin'),
    ('telegram_mode', 'admin'),
    ('telegram_send_menu_on_button_press', 'admin'),
    ('telegram_webhook_secret', 'admin'),
    ('therapygo_max_bot_api_key', 'admin'),
    ('therapygo_max_webhook_secret', 'admin'),
    ('therapygo_smtp_outbound', 'admin'),
    ('therapygo_telegram_bot_token', 'admin'),
    ('therapygo_telegram_mode', 'admin'),
    ('therapygo_telegram_webhook_secret', 'admin'),
    ('therapysto_max_bot_api_key', 'admin'),
    ('therapysto_max_webhook_secret', 'admin'),
    ('therapysto_smtp_outbound', 'admin'),
    ('therapysto_telegram_bot_token', 'admin'),
    ('therapysto_telegram_mode', 'admin'),
    ('therapysto_telegram_webhook_secret', 'admin'),
    ('video_hls_new_uploads_auto_transcode', 'admin'),
    ('video_hls_pipeline_enabled', 'admin'),
    ('video_hls_reconcile_enabled', 'admin'),
    ('video_playback_api_enabled', 'admin'),
    ('video_presign_ttl_seconds', 'admin'),
    ('video_watermark_enabled', 'admin'),
    ('vk_callback_confirmation_token', 'admin'),
    ('vk_callback_secret', 'admin'),
    ('vk_community_access_token', 'admin'),
    ('vk_id_application_id', 'admin'),
    ('vk_id_client_secret', 'admin'),
    ('vk_id_redirect_uri', 'admin'),
    ('vk_video_service_token', 'admin'),
    ('vk_web_login_url', 'admin'),
    ('web_push_vapid', 'admin'),
    ('yandex_oauth_client_id', 'admin'),
    ('yandex_oauth_client_secret', 'admin'),
    ('yandex_oauth_redirect_uri', 'admin'),
    ('doctor_today_preferences', 'doctor')
  ) AS expected(key, scope)
  CROSS JOIN (VALUES (', '::text)) AS comma(value)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.system_settings setting
    WHERE setting.key = expected.key AND setting.scope = expected.scope
      AND setting.organization_id IS NULL
  );
  IF missing_keys IS NOT NULL THEN RAISE EXCEPTION 'missing target global system settings: %', missing_keys; END IF;
END
$target_system_settings_gate$;
