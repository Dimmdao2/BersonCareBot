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

INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (3, 'f24e27c9937c5ef9cadfb3a3b2affe84950dd0404de91d6b44d549ec4fc142ab', 1776461044181);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (4, '4a94094d4455a6447b2d3bb3ebcfc85f270e63391816144cd99e111c52a5951d', 1776462827208);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (5, 'c09e59ea00fd71cd8c69bd548dc885693885aeec18ca22336fe7970bf819e3e9', 1776463964340);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (6, '47a7211513f9dff962cfdefbf2997c3adeac5ecf84dacd4487c621f6e4bdf1b7', 1776465044827);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (7, 'b372e9e85bf7a1d7fab35c06bf441e2d7ffdc2f3b045f1f8ac90de9cf2a8e5b3', 1776465707489);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (8, 'fee55f5c1709582eee9a3f6aed11c07c8c7233447507c4a4480840ed482b7a95', 1776466804469);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (9, 'a95e58cdb59cede6a08f23c23f9d37bc0ec3094142c8aae108bc77f0b60c15f2', 1776469000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (10, '50ab599cee794ed3190736c2d8ce68e2938020cd7bfab0f7f54065c5d8b80663', 1776470000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (11, 'f450070de716307e051d71bc717ba769b13b3e5edf211a326694ff7da6d37ca2', 1777386743746);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (12, 'ac68ff74ce96f915d75ef42183e11157fff89aa76b7400ff479460f587918056', 1777394765741);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (13, 'bb52823fd4d9d1ae8ffd2d6fc95911d70a001d0c5a22ef24d83eb9012c7c4a4e', 1777401325439);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (14, '44298270b0bb5d1f96a4bc126f8d78de623ef5accfceb187778db398bfb352f1', 1777403852273);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (15, 'c8d5907b89d7aab93a3a619bab5bd156e1868ca536e20461df4bbeee70e9103c', 1777500000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (16, '2d70432cb262bf11da75f0019a0c3c538f0bd2d176c8cf63bf8870ddfbb78316', 1777517459440);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (17, '1d65aaaea2849fd57f1adfb5532efcba26bd4148b67958a0ceb09076563d6cac', 1777568074358);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (18, '80afd21d23e62ca60972ef2e5d8481745523b419239ff91e6194c6ff0f66e6cb', 1777573976837);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (19, 'a0ce6a181a1873cd7487625b42667c110305df2091970f9469716063c8f8bbfe', 1777658273229);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (20, 'fcd79a95b745b321eb2b258c432242f750e1ad6aa8908422524748abb14e561c', 1777678290811);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (21, 'c03e3c9b1374c0cfb4367716dfd63c7537632fdd37b39aae8d1f214135ceaf2a', 1777769367221);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (22, '7ecf929108b4022ac97a4eb97d60da9fd7d2c17d4837fcb4154c1525a3d5008c', 1777769879744);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (23, '51c2493237cf857693cf8172847c37a715384de88e438d99190cf99b6703c7a7', 1777772000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (24, '1ef02be269a69ffc88ea26006b2bde4dd757f6747933a7ec6c4efe7ba5f8f9b2', 1777773500000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (25, 'bf3e6aa97c7c82faace73e95242cfaa5dbcae4a35d370d094a6dde4c3ecfe557', 1777776100000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (26, '9894f464fe8a20e32ab55839bc25f67abb9594f6879ab9724af63ffa8407201e', 1777777000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (27, '463351169034a003f8ea2e05eec0b4182ba3cac67cf2e6f5a86d5bd7e07ab747', 1777778000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (28, 'f8cdde3fe4735aa3115b0c76b623df6c3c87cc194ca235f2ab4a264a0d9c069e', 1777801389725);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (29, 'a9b889239f377c73f09d7bbc6e63857f2e69d4d3a9e3a4c7a8b356a4e117eee3', 1777802999509);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (30, '0e57282e074934e96f2859f000eee5aa12f77429b321fd84480ebb102d1e7021', 1777804686327);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (31, '682ef9b00996097db4065a654b6d93620fdcf99b35f6b381f3013393e0e42227', 1777806425247);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (32, '9d1464e8e6e86b19277d18b3bcae4856b4681eccab7da459925cdbcf3bf7e5ca', 1777807857771);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (33, '03fd03d29bee1b3d720bf52d5d1169de42be2edc0ca100ad2c799209d673b9d0', 1777810000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (34, 'f8e0edf9c227b6ffc64b13b4461e9978f29a67a7c37d8d207e7164097d884671', 1777811000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (35, '82670d55ca25e8b4e451e4b5216d433acbd6b9c7ec634064da211a00724ce35f', 1777812000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (36, '469beb956e4c581135b83045ac8ae986a1030057535f03e060d6313c0ec091dd', 1777814000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (37, 'b69ee5b78abced05f9b5add6b08bb6ca16b48c6c40cafd6e98fa7791f910f534', 1777823521139);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (38, '7b2df648860b74d46259845f6ba122773fdc28508a6b7a2c6462031e4834946d', 1777900000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (39, '3b7c3f12ff0278da52f478923958e2b2f2dfeee508f91edbb5458505e2f746ac', 1778000000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (40, '661e0fd3c46fc0dd1a604a2e06ff4892418cd045e4f0e46364d3662a213f03a4', 1778100000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (41, 'd98ee00864a38dfe5596571c210d1843f7afddbb199a935f5a70eb770d8105af', 1778200000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (42, '4f764d6cc0cec5c7bb398d11ab495ded4aeebaf8aac1458566d2f710bd70ba7a', 1778300000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (43, 'e5364dbc857bd9b9739b5b77407e96ca783a6547a50bc9ac02ee9c6722fbc15a', 1778400000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (44, '731dd248dd85fef930843c903d7a2cae2254c6177a2d62a78296224110b5ea6c', 1778500000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (45, '20e3dc7bf3172eda7356d4b0769b2b1023f1ff87f6e82566b822a8a5287d4c2a', 1778600000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (46, '121f7d6ae150f24b41945459fbb308913b7f0371d8fda3dc4879abae3ebbdadd', 1778700000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (47, '3849ae0c57c244a7888685c80e5fb8d25970ad7c84c22b12f4b6e654df956f42', 1778800000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (48, '8405bc9ead4f10ce17557d8e541e3a6a2578f8b030a3dd5a9a7bbb4f9d0fa96e', 1778900000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (49, 'f3464cb35fbea7eef3c6c289d7cca80aead4bc9a2f44d0cd74ff4bc44b537db3', 1779000000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (50, '7ccab71618002fdda6f6c84756c48daeb42c7d49caf0543ab9d0d7ff5aa8e91d', 1779100000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (51, 'bd7f55fdf8c2100b83edc7462d287a222f20146cb93cf3fe6b5d24e6233cb2a4', 1779200000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (52, '36039eb98e4c9f2bf62d8d97ea6e98286e78dfecea4b0eacf2d8bf6ac3edba70', 1779300000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (53, 'd267a784a48738b0bd5d2da5d2cfead89a8734ce4a6f2266aaa4a53552ac3490', 1779400000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (54, '6c8f8b4f0efbb784cf98c67e247ef40a8807e3c33c70f27a5e622279ad53df7b', 1779500000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (55, '2c5f40927b4a20ab70fe041c5ab0eda2072dbdc8402f99f8caeddd415bd314f8', 1779600000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (56, '34801646c8ba639df052feddbe766f6ffa569ac9e01281c120b0c2fda74f8030', 1779700000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (57, 'df7de67f90590f8decc04fc602be9c5780a5e9dd7d4a3d581b69b390651f06b2', 1779800000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (58, 'a1e9f93e4c09ffa28f35ea616caa2454823b915e797bd3f171c18f9a4deb0a38', 1779900000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (59, '83169c730334a85bf9259143a39658701327426a49d37d3a66ced1735667e750', 1780000000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (60, '0b205f063c6835e611f15e30354f1763851cd17464134f4822e137782d04bd4e', 1780100000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (61, '5d4304059d159c728a6cfebfdd52e0c9bed9c5b0009b1dda77b6234634386126', 1780200000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (62, 'fa59f19ac5c189095810f48347a169cce8accceca3ac885fa8947910e6587b25', 1780300000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (63, 'a1359ecdff614b661a8ee479ef6b2c735d977817915dfdbab991c2e47410a54f', 1780400000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (64, '926e041bd6f32ff525f42f3b65dbea7b0d23d2b8039e0873c4de300fdb355bd9', 1780500000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (65, 'd214113386e9f17aa8dfcfacf2ee94e9d05e24a8bfd87009d7b093b370e278d8', 1780600000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (66, 'cc93ff028070046c8cfd2ecfe10bc08f75aaefd30836fe1b217fcd750da77036', 1780700000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (67, '8613c2ee670025ac4c7fe681035113a7cf3d155abe819da86b3f83b74cf86d75', 1780800000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (68, '7d807f6f3090b34b4fffd519ddefcd37b19f184f3dbef659472d1184d0c5bdb7', 1780900000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (69, '75ad46b5e0b62ced74b071774d2b0854e7b6b310696e19047388a20dad892107', 1781000000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (70, 'f22ca25c38a5fcacfdb3051e06e7414dd4a4cf4e2aa7d430127cee3c1b415185', 1781100000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (71, 'a9fc6f81a80efe771472fc0bd3e980fd1b0fc4224ac07350684138aa537ec22b', 1781200000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (72, 'fc9906e6085bc74ee4a462deb76197802530c2d7a2d10b98512bd31c9d80fec8', 1781300000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (73, 'dbe011d4b0ca66e73f4fe3ec32731810fe985ee1c45ac1d93574b9f24a30bca8', 1781400000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (74, '84f99f7aee36ce15aa81b602fdbbf0ffe625f5c459e0a393fa9a41b80f3d272d', 1781500000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (75, '5e025a11e8c09635bdc5a358b5e5ed67a004c0e84231ae6f0832dd53859e62e4', 1781600000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (76, '7ea4b30cb882ad297a1394a2c26e450c1cff324b80a98af302ab5642f87c1018', 1781700000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (77, '2e35f21392d8f4fe4d9ea19143d78e3c2909389a1962d6ecaa58d3ec620e90fe', 1781800000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (78, 'b4fd357c2b5b219a3b7a3220a1a48e5bd04b8d7baed4f9d806f05024c13c9a0f', 1781900000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (79, 'eb09cd61dad0a062c542830aa66768a06b8788b6c4b4dd3844101ba00ecfcca6', 1782000000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (80, '2d285ef1f59caa03cd6edc55e8bd978aacc0fc2d64555d5221527fe8483f6e47', 1782100000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (81, '897e3dfe4443182815d6f911141a2815229f9a03d79a8d4766a1abf8e50fc0df', 1782200000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (82, '9547b0bee9358885c7d3e7e5ab66b779e057d4be0652bb4d8671ee823e36181d', 1782300000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (83, '2b2e956b77a7ae53e1bb3b09d8ee134450af5bedfae6051b5596968029161318', 1782400000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (84, '40633397ca7145d7db82da5325e63189008019fd4d45716970dd5b661493168b', 1782500000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (85, '6f421f4b7c19da8a6b11c1270d4bb2db7ddfc2534912e6115c10bb42dd2a8924', 1782600000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (86, '3e815b9f9ef6108624bab3e6f20ff38fc564f89f03e6a608584ff95c42ded95c', 1782700000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (87, 'd114df147ea036183231bf6e7dedebc114d97dd9f1b3c0cb47e3991df35829fb', 1782800000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (88, '26e18b398b67bf0696535a15a15804f53c26e6c7b5863d9aff0f4cf3b0d8fd93', 1782900000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (89, '680492621c70463c993dfa3deb8670ff8c8874df699c23fad3105522062540fc', 1783000000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (90, 'e9caf1dc1bddc719f9910c0de863e02a81cd83465524b9ff0c6cad603edf95f9', 1783100000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (91, 'a29a6610aad10b8a52c0e0a8036e7240ede08c96b078564a94d03e683703bbc6', 1783200000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (92, '3a7021501674be81a8402d207affdbdcf1d63e7b1c6413b8092bbf5530bb7f1f', 1783300000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (93, '3fc702cfa01e4d234c4f94c1fd2ac065cba30d4ff44fbc02ddc7c44bebf1580e', 1783400000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (94, '597408b16976965a65a56bff52769e1fef5f72f0c80eeaaeb7d95ca9644456ee', 1783500000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (95, 'bc27a7f8f4281ceaa66a12b63e3f748db5934fafcffec2963eb37cde05000286', 1783600000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (96, '0b6d251f980bf0b579a00119f7ff040520caf2dd18f07acdbdc84268e90016b8', 1783700000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (97, 'eb58aa1ddb3e99d0523d44cbdd9dcd2f52a6dbdac2684cb711a8df7962cd374e', 1783800000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (98, '6388336dfbea174c554838e514e4dae5ff5cb67335c6b939d44b721da211a92e', 1783900000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (99, 'b789e9a46f26339260d5d606ed3bb0c65cba4abd72a726afacfe6a3f714bb53c', 1784000000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (100, 'b3d6f9f94ecf11dcee9015ad5b6fffb0f67549f652451b24e5604b96fe8afa3f', 1784100000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (101, '6e00902e735c12d0cea35c5463ef85159e0f62dbccecb4b6d73093f3512bb771', 1784200000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (102, '4e84090ab37ec364d687fa345acd7d7352306149a7d14b1faaef4462a2c6cee1', 1784300000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (103, 'dea64dd26c656cac1241a7ab0399aed6042c7f91fcdcfef11c66d631a684b10c', 1784400000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (104, 'f44f79796cd56db541df60a818915a9514cf7ce6e39bc50d4574476870c86d8d', 1784500000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (105, '2da82f87e5dcd997536c3ae3a5751a8fa680309ebe0eb636b643be95b152127e', 1784600000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (106, '39e5770c08f63b9bdf03c7389c126a5141a67011365ed534e279db50d6cdab16', 1784700000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (107, '1c7f49312c70d7607c0e8e18224bf81ca1a7ea28926025d02f854b1f6f1d09f5', 1777813000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (108, '5bdf5c0ff02728f2f101ed83fe01bb552fe95da869f1ee807160c061518b9403', 1784800000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (109, '6f6755f7a3a23a14f5d7602d4482839bfe3319dc1b013cf2183dcc644a927685', 1784900000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (110, '634f46c74d1135729194c4b1920ff3ab4824de5294cb7cdc6e7101e9720724db', 1785000000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (111, 'f9f9bfd5219279a29d402c5b2b7c9642fbf0f44b8fabf3c71470ea67317ddce3', 1785100000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (112, 'b55e450e351efcf320970d1711276c4be4f78d4426c36d868a2a54a3a24d0dcf', 1785200000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (113, '439bbfe0ce8e0744e96f27050f0b46b2a65cf9096718178e61c92aae078537c4', 1785300000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (114, '5d6a05ae7e24c4aae9339856bc4236e5628ae79712690b61b0728e3018e768ea', 1785400000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (115, '95ae3d344523ab649d9e6234cc09bffc9aa215f529bdec17442312e2ce508290', 1785500000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (116, '120df5e4350e9d6a180df7a310d5bc99e87471c914e9f2b2273ef4f2997c8ff9', 1785600000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (117, '9aaca198ee565854d3830b1e7ef24db1e263411f98f2385c9ff7ab57cf36fbbf', 1785700000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (118, 'ff03cf611a2e2e0345c65c5ce8747d69710fdce0a2ded401c6143cf975d87963', 1785800000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (119, '1b09937267a0f2ab1deb48e17f9dec5161f5d6ade1819e80ecdf9fea24fe621a', 1785900000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (120, 'ad970152e21435fc92700272cb22dce2e0c696dd673475703ab665170c2c99d1', 1786000000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (121, '147142e637e6b8b0b5f61a9edd082e8e471d1363562d5ea1bb678761afb28686', 1786100000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (122, 'dbd590a433e42bdfc175853d082dd834b4dedb1fa3a105c643690ebefbe57672', 1786200000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (123, '347be8f5b524a29385dc020e9cacfe3cbc1ddd6327d74df132b63fef825934ac', 1786300000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (124, '0e683e0b2a0c5743d8acc32a7a4750b15a388d498b0c3e0c7407c51d644d88ba', 1786300100000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (125, '32a6e4abe0f6cd1c34d6451f36a2bfc19c58d864688374cd02de8d8f8575c9cf', 1786400000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (126, 'd4b399afca42a656b4ceaf450d5a5b6aa533fa8843e278248dc73c23dda0e776', 1786500000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (127, 'bdf3c6f42afcaed2011cbdc28a6cf7af227ef4f50d3d1fb4a2a466e84f963632', 1786600000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (128, '23125bac84e1d52e58a6afde2ba0f135cff3573d9f16e87daf021789d0671dd2', 1786700000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (129, '8c92f675afa374e1dc08c02fad9a5a6c9f83a9692f8f61974b4ec55797377588', 1786800000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (130, '28d897e17a34fe2c049ac7e88f65965186fbecd96f67256ffaf27efd0347c62e', 1786886400000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (131, '8e9e587db070d100a0f0b16b98555ae7a0ab56f528660cb5e70d01b788924f0c', 1786972800000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (132, 'e420be81da51c0fc30f6170e3eb60a3e9e9d7a75d405b35540548f44cc3fe33c', 1787059200000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (133, 'd5db6b4f5e086da907efadd2439e942582828edd2b022674ef494dc62c5e5314', 1787059300000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (134, '10a1638d33a3125e007bc9618deffc3b6885972be5a0f873c745cf1cc7858e72', 1787145600000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (135, 'd7313713d9f6b5318caa42c8c5162a43b9797abbee47adf77e6bb7085772ff1c', 1787232000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (136, 'c464a6647822b20231686d5f8ba62240ec49438e21faa877f638d24dc53d869c', 1787318400000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (137, '3cb659eff71adfa9758b2b32b2622d15fc8a9857e06ff48616822abf70b09604', 1787404800000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (138, '06b3094e3fb4079ba2575d39025b4bd96b2d11a70683fa15f8a0ea7ece44bc43', 1787491200000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (139, '3640b003790b1642ac069050c5fc7a1de22ab78138f9172529543394b7000faa', 1787577600000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (140, '6983accf5f59d48353b5ea6a3d1db536db8e0bfe6d2026de61e6ae84e43e92a2', 1787664000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (141, '3d017b6d6307167470696bc476dd2c2541a843bef2a3e0004ce1e9f8c05e1ac0', 1787750400000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (142, '39cf8e2110432a4388c3c916900d4ad6a308aed21ced5ca9cd8ff4ea3b74e699', 1787836800000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (143, '8730943ef9b49b97b6f2feeb006c496aa8144cd421b316d323c710b9acead676', 1787923200000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (144, 'ab181a32b8e1e4c8360b8ee599349d900db69f50d21ef662ca1dffa10774c56e', 1788009600000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (145, 'f71fcf77ae293864016a6530a8c662db4b60680817cb23ddd69a634f826e48b8', 1788096000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (146, '516b0d8c72ac94b2ccc5e05382272ebe6005388b4750d65079c6da55c311e0ff', 1788182400000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (147, 'f7e5b66218c2fc306c2d295ce7d6e280bfe54895decd123ceeddad3a6f81c5b3', 1788268800000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (148, 'd34744ab9b77356fcd048d863e37f5191121155582a33aef2d5cb9df244f6a52', 1788355200000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (149, '4d34f72e1e97c4139093bfd806f0d072f1e420aa9921502ff2c84c1ce45de92b', 1788441600000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (150, 'ddcfe73ca739cee0a1bab3e56f367e638e8618219a4267126d6bdbd7690b3acf', 1788528000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (151, '84b9bfb95ea243883bcd3295decff12b00faacae0fb9a098f8a00b91bec86c24', 1788614400000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (152, '813660fab42df26fbf4f73f8afbdded7938a84576654797f1fcc7c6519f9d3fd', 1788700800000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (153, '0e7c2edecd48c58a3ca0c0bdb1b755955cd18434751af83e2332b48274fd4626', 1788787200000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (154, 'a6d09d234b1be416c98e492a764226fe80826de0066439afab898ee2a69cc4c6', 1788873600000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (155, 'c450deaa8c09df7f3b20327260757135dae6f905f44a8f608993835a679e340c', 1788960000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (156, 'fa2270beb410e239d6a9596f61f51998556f676623d4334a659e748af6e55bd6', 1789046400000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (157, '7d4b7933d84de9a1f9955abf1065accbeb72bd49203308f0fbda2631b908024a', 1789132800000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (158, 'e407ec81776f46e266d96f17c43b5b5913a8738772a66574a256e87d4c33af9e', 1789219200000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (159, '6b8fb297da854b02197953a6d3f80336e4437448e128d798d5fab7eb90da7787', 1789305600000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (160, 'ac0d70175bf9665d697be7ca3f70b798f6532ce94adbc6b38866254e94eb35e3', 1789392000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (161, '4d00e79850af3105dd8d5759fc05cb17929c7ff3a3e2caf2d5bd6ded41899930', 1789478400000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (162, '0baab6ac47c3bfb874278c94652d2513953d8371bae7f2fabd26da507a2326ec', 1789564800000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (163, '2fde857013f836e1c0a53a8d218463efdfb46278234eed5dfb10bb13ba62f0ea', 1789651200000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (164, '40d52f66c301b46658f2ccde9547325d1ada64a1a19361679c350c54de000c10', 1789737600000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (165, 'e817670e9b9b657d02e6972da5ee894fccc230ece7ba089e9a928ac3e30f556a', 1789824000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (166, '8966b8fcc7478fddbebbe81a3a393254e10f0dc17ae6897c1bd7671a47fee7b2', 1789910400000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (167, '4fb0c0c1acca0723dd92ac6238676fa9694acca95f222c3a0608f99b5bde17ad', 1789996800000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (168, '1d030a668ed06b4e4e9717fad4e472c7fb2300c5358ba73184f021c2eccc6375', 1790083200000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (169, '54aeb4a216017facdc7b67c5c4fd590d75d34800df918a50087e0e4e281947fe', 1790169600000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (170, 'ae442259bbff6773c2dd29d0648b52cb1973cabfc3e98adef813bfb84997bd97', 1790256000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (171, '455da7320491716d9fa84dd00380221a3e92332aaffc5df896a374c8c6b13614', 1790342400000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (172, '15e0349a66e98c26cf45afbb491fe23daba0ac42dfdd4829c001f3af5dae7ac6', 1790428800000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (173, 'd053152c1d48f8c6b6bb67d86123e7e19c2a6ddbdf83b6a7e413945ccdf5d398', 1790515200000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (174, '60f7fc195fc8deb96e2762dd62b2fc18fc2a8d4eae256d62066a13083a701884', 1790601600000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (175, 'a09cf604d63810afe66c434149424e4be64ba83d7d8ad8111b72cb4402ecea5e', 1790688000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (176, 'cf9d85cedd66d17be94ab63325bb0e1d18e3077e1660f99ab7e57c609d7bb734', 1790774400000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (177, 'd4b12e9c14904534c0603cfaf5932fbefc1649b26f441039f69ecb82c04a0721', 1790860800000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (178, '670a650104b59014da07d88551db4b17806bf982230bd6b21870050d0b23a861', 1790947200000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (179, '35a5d12c85e8780a5e4915ca8f305501a6e7b35d2f34ca84546d32f282765f22', 1791033600000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (180, '9f137d550215ef322c04d7a9c0a062cd4cf796d5649a1115980d293274fdb3f2', 1791120000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (181, 'e206ced3126b1f302494a1cd80c7a46c0e199f6f9f1af0768c9e2bad8c43f91f', 1791206400000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (182, 'ec04d85f2793928ae8df23aa75dd9b5d8be714f14728dfc7e43d017f475a2a19', 1791292800000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (183, '8fd029e2f311404becf205e41bc05313741aedb9238772ee6844bb79d7124e42', 1791379200000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (184, '6915b30bf579c23ef194d4253176551a56f0632f137ee02d3b7a48da28d34485', 1791465600000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (185, 'fbb84be7ab5d7a55cbc1a65f8f966d66dc6f0ee6709b86ff19678eff9588ceb1', 1791552000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (186, '7bcb486ccd0b6e26a47cfd562793130f91fdb65e06ef29f3f80f51a00725bfbc', 1791638400000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (187, 'e1b7252442e8541d769e2422a86c04bf23795278c863f3b5df273c27b2a962ef', 1791724800000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (188, 'c74cb401dcefafbf3b5e28866882116c320d1fd2e875fb0a0f8f309390b92b3c', 1791811200000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (189, '7914130add405faf306624c62f2289f2fc3008bc7cd9aef007c549c5c7979775', 1791897600000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (190, '6ced9ee04e6e37bc82809d773a37d407b114ebdd0dc48fbf894585af51f4b488', 1791984000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (191, '9077d5d5d5817d96e3f33c162a168ee3ec7f98225803735d3e2d2dff6b12c2f9', 1792070400000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (192, '6a4825f345fa7832489a6045704bfb0256c59a3be9865c66e5cbde5533c18a95', 1792156800000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (193, '046c3097151d29092f32ff12e3c09d2a82445e30893a7296fbe60100b49bd912', 1792243200000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (194, '3eecff505f69c734186928011eae2b2c871a33a612fe129da101f2e8f24f8133', 1792329600000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (195, 'b2463640334ecaf56cb374f9b45a9e44f34084e42b70fb22125d96d40ff932da', 1792416000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (196, '2ea7eac334c32fde68471829f15ddc690c95f449b8a7e2a23429d579c1bb414f', 1792502400000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (197, '1acac6b8311b906b0ddd48cb6009ebf1d90d48175dcda27f2ef01bacb6ff15bd', 1792588800000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (198, 'a9cb58ef74baa6f0596c14de4adc07d4217b31ec4f28857739b285572cf89c29', 1792675200000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (199, '342467a2eb3775f620008bed81535e8863d1ce70fcb0b4a6da933d75764109e6', 1792761600000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (200, '5d0f28bc92ae13bbc0e70d130c4c6e4d01ccc8c4af794d72c38d28e4aff60b84', 1792848000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (201, '6bd00c86c03c4387aa0f64a3a8bf7f7d55a73d5384ae08c8b0ed8e8ea3434cb5', 1792934400000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (202, 'f4db8511cd11716cd49e629771670b21048f9bb6627d3fb0158dd664485b8db1', 1793020800000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (203, 'b765cc355a6cd1f0bb3a0061014da3e48cea607a18929dd64bfdaf3b47d0e058', 1793107200000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (204, 'e54573465b8702b32a3d80002c823104fe6ee8898a5a7d3d231a2ae625dc8af1', 1793193600000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (205, 'b2cb76ac3e6eb15f18037f18182f522480087fbe9e44f73df350caadcca56190', 1793280000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (206, '535c93be77862fccd055ff4b4e2c82141062962f3b02619b667cb1e68bd51a25', 1793366400000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (207, '82e56bcf1496f6746369143354f397f46fe18ebf5be44aca311016c0a499c3d8', 1793452800000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (208, '8cba1832b8262d5467f7e0dc54db8ce9e3bb926306c18f65050174298a2ed379', 1793539200000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (209, '0685116ae7b814ff25ad4d32dbbe2c783b349113510a2af65542de01a73be538', 1793539200001);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (210, '05891e057532fa7c244334b76b307cdc4b53a13c346d95d0fd242e77f0bf1a98', 1793539200002);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (211, 'a820c96735519dcd249f2f3e0cc9a053de72b747fc813cc60b80286ec7ab10b5', 1793539200003);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (212, 'decfe45d8673cdb8a9ca21f890bfd440057a32785612c3c4d3b7f24b4b6c2910', 1793539200004);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (213, '75084b0a11b90472726c4b5e471b0e094a94e76867ba88511eeeb9f6cc58c9d6', 1793539200005);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (214, '694dfbd922b3ad6226bf402f2cf9a0e014b6adfa5ad8d15591e23568f11ae4a4', 1793539200006);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (215, '14c40d099a98d0d3fb32f83bca857251522908a4e7b08884bbf1fa14e2c73ed2', 1793539200007);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (216, '6093534cca248af5ebf17080fc9606dcfacde3813f45ee8b991f32c5924af4d0', 1793539200008);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (217, '58accbe194fb190dce3eee8d220f2badc5e8bacded35dc721b06b08a45eac46c', 1793539200009);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (218, '6ea61987cf282f68da977c0916024343fa581752032949cb7024051319d6f88c', 1793539200010);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (219, '1819a0af33d09fc686248bba4c424931c7a6039484ea9eb5e3e9ba9cf600be1a', 1793539200011);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (220, '71adbaec9ecade3d93bea45ede40c5cf1f9d61129e4f819cd7476a32204d7482', 1793539200012);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (221, '52a38aa3eb2643cb9422d44c9b66371fc535926cb1761d7c9d98091283923f0e', 1793539200013);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (222, 'dfec2b8844024a98797e5324229aeb042b038e52f3da2f5f44f126092c3f1f56', 1793539200014);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (223, 'b51d1bc82f28e47cdcf4b4da2d65969dd0e33d6a26001fbaad59aecd1840b99a', 1793539200015);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (224, '15190b16457d932e5dc3d01ee710cde5c44a054cd8e463edb6dcbf694aa92aa5', 1793539200016);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (225, '67055396068bcf43bc5fd72e52a5dc9882fa540171ec3447e5b1f0712471ae91', 1793539200017);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (226, 'd3f27a4f4995bdda4cdbfb00b1b31b08d201276374891e22f54b04866ba09e9d', 1793539200018);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (227, '0d12b7473401b51c2148ab80ccef76ce6f58c2fc452c8be19b0779a86ce7def3', 1793539200019);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (228, '151e2562df764c99cad21ba78af65ea8c0f344740ab669c2e80e9a011f7115b7', 1793539200020);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (229, 'd8454765fcbf5126934f5d735c7bffa1a0fc27d0ddecba0e5747d30009c4b370', 1793539200021);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (230, '4d0656f1990d6f87bb3bb25dec6d6d9284c1cc3acf10fe9ba0ed782594f9653f', 1793539200022);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (231, '1da43a71137a85e0ea3c31580df998a824251d5553d4cc9307ee196c18e1b11a', 1793539200023);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (232, 'e056328b0a20f20619eaff776b817c314f37f47e08725c9b51a96da273e4f11a', 1793539200025);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (233, '9030e76b8b42da847c0fe7ecbac75838b614562f4a6ff8757cdf87dcd4c62229', 1793539200026);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (234, 'e0288b8c6b11e8736a849e1ce73d10aa7bfab6d497bb848820e6ab4890c61a8f', 1793539200027);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (235, '43992f5b77f6bb811fe223f7c893f002126397f97f095b8e6a3bff672d96cc91', 1793539200028);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (236, '3fc85cac2e837e8e8c96ae7a41a272771c71f030ae9af5071bc10a71581292ae', 1793539200029);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (237, '23de3972bc68ea3fb68098c8b6b0e61d90d812a5ac8eaf35c12b29fc4b793c3d', 1793539200030);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (238, '9314566f9c38a791bbc77e8da3151f2c3b26747bc45dc688d1f501663198d25f', 1793539200031);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (239, 'be58af557344a774c39ef9821aab3887cdfc013faad93042145d9078dab34826', 1793539200032);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (240, '5eccaddc61fd86b221401a9b634f4be57f899a73d2e5e6313f2b5d62c331fcf5', 1793539200033);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (241, '52a2bc1a799a8ffc878a8f6b015e6edfee19ddbdf4448230a0399532417ae5bc', 1793539200034);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (242, '345c5d91be1a9f60e819e3a2b9fbda8e36c5c6f6e5710d8d9adff24199d23e26', 1793539200035);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (243, '2801a7f6d7bfd20bdb760cf79ca00532621bd2b86a9ed39711e02e16be7b316a', 1793539200036);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (244, 'f80fc5103671ae0e07deb47044cbc2c1c9445bd95d1d1cd5c495b024c3a7b789', 1793539200037);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (245, '076c9401de9f0bf6ea173957ed82282c788655817f5fbaa6835724872eb806b0', 1793539200038);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (246, '11b2f60458bf902c8b2d54ecabaed5447c1855f1dd759cca9ad9d0416e8531f7', 1793539200040);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (247, 'ab2ee305066db13272b291e4a3d13998094766d8e3a2bce42dbab2e342b4143c', 1793539200041);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (248, 'bd45333f9a87d0b1f068cc6e5fd646954068a1a683d9b5436c61f88528295e56', 1793539200042);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (249, '0aadd9b4adc383094131d6f0267787b62f0ec05ebf3aac7357f64c63d9250f08', 1793539200043);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (250, '739b003743dd052eb45a26772f01520ad7bcc967928a3cc7ba8ea18eac5ccea9', 1793539200044);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (251, '65da778c3febb86e9daeac3a27e127d0c3df6dd06b150fb0ee00f0c9a01c34f7', 1793539200045);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (252, '92ea00a7bc939c78a6c67ed31e0978d0208d7e1f43705075d930bc40f7d18944', 1793539200046);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (253, 'fd9e79ff5b626d210b78ccce5c7341ee009695629e1d21cab5d0bd11358674cb', 1793539200047);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (254, '93aca9f4bd98bfde14680fc5dad904836aed3c0c836f898b3138a5abe0b251e1', 1793539200048);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (255, '9dcc4a98db3c3126eb54681074a19e017a726e032a874b3e131350553741469a', 1793539200049);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (256, '5becbaccc3abc600b1302f2ec7e124cfb7f6e2066f9e0d5227ac6626698e8c54', 1793539200050);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (257, '28fbe1b2206bd39dd487c8341e5a7dda65c91e4622f671070aeb3ca229dea732', 1793539200051);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (258, '77d1fd52c1245d5a69b42442af8a86907d8274d3efc83dadd6c74e3e7c3d02aa', 1793539200052);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (259, 'dfec0c6efa61047abafcf7640d1927caf4f15c7822ed7e69a150840887d441bb', 1793539200053);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (260, '82f13a63e98dfdfc40459a3395357f4afd95cf8bd2e3bc59b9707aed5af73d8c', 1793539200054);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (261, '025477e184145861d0f34427c085402bf520f4e7444e4eb7d49c2558a94eb6c8', 1793539200055);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (262, 'c4be1d0f464048420a3c607913bf3fb39dca2d3043c45251743c8ac2b1142eaf', 1793539200056);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (263, '0be79c5073453bd12bc926e5c5cbc5393c5c4b3de0b1adec7054115bfc5f667a', 1793539200057);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (264, '76e5d5b26bf91cfb6ab53789cc82fcc231658fc5e339be7be1c9ce7e2f705c94', 1793539200058);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (265, '579551a933896f60bc62b59d140bb05e5996558798990479bb52448c2f0c6fbb', 1793539200059);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (266, 'f53a1d6abd8dfdf08324bd1cdccc32a35487b76753cfeb83d8b75feef2f06c91', 1793539200060);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (267, '283d2e33e3c77487a6373a16020687ed46e5ea31de6de7a91f85f60a43ddf12f', 1793539200061);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (268, '971129d47f6e1e7923541c7a19637038ec6f112c29579376c431fedee4517545', 1793539200062);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (269, '7825a1cdf10e162ff72aa4ee33b3bef6a252e44137f4c57af2d6b16ce8774c44', 1793539200063);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (270, '6892f0aa3a64a2acab3de6da0d61ce680c99ddb51c33b5c4f7b958f4c0e6c421', 1793539200065);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (271, 'ff95e5e3b3968e8ae3039cd51274aa2af95800bab58920964e827e077ebccaeb', 1793539200066);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (272, '22755c895a284b121680f0205ba5ee4e455aed7aed8552704f8346118d5672f4', 1793539200067);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (273, '45ce244a009eaa08fe5caab39229a0c940f7a9c06c0a1b5dedf93c818b61d045', 1793539200068);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (274, '9c59bffaec643fb441d48500c97388927d0091027bf326f8911f021ab405374c', 1793539200069);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (275, 'b19104fe9accd9e934778a9bff61b7d21125323595eaf49b3227e41690ca70e6', 1793539200070);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (276, 'b8649cae46e2f47dbc56ce1fce57e4201c9d2d824ac4727a6de28bb8e56b14b9', 1793539200071);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (279, 'e2af0c60e6880bea7a5b1357cc65ce082bc124d55656b2b9771f32f10405f0bd', 1793539200072);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (280, 'c5c802c2f157b183c3decb9ffc19c213cb349dd9df29535f855cd2232b883125', 1793539200073);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (281, '76e4af1f9d808d41055d90eb4657734e1b1fede34ac67a73d6d647c6b2e67f0d', 1793539200074);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (282, '6ea730afea26bbf74ed10562dab1d2014db247944f814e981ebe89df9e2f2002', 1793539200075);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (283, 'b98dc00cac4cc8726671d5b93f0587cdeaa170e707943825cb16e939302e048b', 1793539200076);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (284, 'a49158b61e320361360982d7d86bc70b7784ad435eecec54e12c17bccb90b273', 1793539200077);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (285, '8587634fba3fe2a088c01cdad5878283d3a4cb3567e58a1bf1f4dc2ad592c25a', 1793539200078);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (286, 'b8309576af890cd0497bacacb93bfd2e1bead5c40b49a335a34de69d110f0be5', 1793539200079);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (287, '4ff311085eccab220eacdea9bd02bacab125203624187b4b69bc2f337302db11', 1793539200080);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (288, '0f98a67b0770d8ed912590f9fc57f54ad339b40ba90085073e5d984b71e04c5e', 1793539200081);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (289, '324be43d47618b49d2280b0d20b395fb8dd3835590eecbc13ffaae3a56facefb', 1793539200082);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (290, 'a38b896be70afa5c7d62687cb0049a2b45ea528c8a14919047d7bdc449e5a3d9', 1793539200083);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (291, 'dd3acaf83ad84b8a25586442c0fb8f3793c3b8053fd36f72a58fa311559e6bfe', 1793539200084);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (292, '833bd320634f0c9450fe681dd4bca18194af28fdea25fec8aa953e904688dbc1', 1793539200085);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (293, 'e24ad29f9eb02df4b2c5badd38fb7ff902993e8949bcfca4b6100e8a872a5ed0', 1793539200086);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (295, '65b11b992b402431d6d3e2b6fec71b62a8f880c68f91a1ab753a16d7a287f2d7', 1784400000000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (296, '77240e92cd6e45bf80105450f8a7ddb81916e8988909e3e6fbc59ca8b212374e', 1793539200033);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (297, 'cdba309a87082b39269467e41c29e5e5c619c9ef5959e9429300473f39b1c928', 1793539200056);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (298, 'ed7de8df3972a2e80ef60c626b7c675494528723dbcf855c1705cedf6f668001', 1793539200059);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (299, 'b1f56552cf04b2a9ce8330a2916d975525915883046824eba58ffc5bf620415d', 1793539200062);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (300, '347f8e3deb3a64d7ba592cb10d6cc9e74f9e1d1baf171b51eb36ee07da6f66b3', 1793539200063);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (301, 'd38cb58f719ab288aaa4ec470a1cde85cb9b7301fb4f29e97c146734e6d27fdb', 1793539200065);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (302, '7140ebac5de3bc04f4f4b0b2d2d71f9bdadfec38b3292609cfe5515c074cb760', 1793539200087);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (303, '69bc7cb87d8eaa0b7652c4a1e335be3619e8a0fc2798bcd922760fed6d6525c5', 1793539200087);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (304, '242c20edcb0dc775fc928adfb2c3cadd0c100af5913193c97544a124f7395f34', 1793539200088);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (305, '42fd730df94d6a28f5ca3793459b044fa59d4063f5ff86f5431392b8e85fe1b0', 1793539200089);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (306, 'a110a07f91202d38d5291e0427772a71e71879b62bb17785624447d2313be660', 1793539200090);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (307, '9c0f41821658bcea0c242e03c2a3849bb19f828bdd7987f72a9587d1b1f8d656', 1793539200091);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (308, '7ff6e0467c69da5103f8f0de67da41bec6a05164f967e827a0f485675239dde5', 1793539200093);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (309, '9214f54f366f9f622c75ada76f6591bfceaa02137a49749ef91281c477489a50', 1793539200092);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (310, '4735077386873c412e97d772ae172b16bcc3b47f150e542e2e63c7bb9dbcb31b', 1793539200094);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (312, '54eed19ae1324dba9317dcf76668cde2f1f226a6be9ee908865a29de55c39019', 1793539200095);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (313, 'aa0ef6da39dcabbcf9da876ab6f3e2ec90ed144e26b17b623eca136c3275c72b', 1793539210000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (314, 'ec7a7178f9e20d7e256aa477ec467381544100e62c0c4099821f5eb8ad7e1314', 1793539230000);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (315, 'd6e88bd55a1cdaf85217cb31976d4786881a28d0340ecd8a2663c66372625699', 1793539230001);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (316, '60250f62fbbf9513bf7a9ec334f8f847f6fec9d407f441e0f3d7cf68203eda4c', 1793539230002);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (317, '2dbe2c8b75ebf8b75cb2e58482e2d0ce02166b897db01d1c9fb17d6187a6d07e', 1793539230003);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (318, 'b695462155abadc4f3718aba3f0ae6373b514d32d08de250c103c7261bad4add', 1793539230004);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (319, '1cc9b770bc8889f1ff5f2abf3cd6227b306534683852f24539a3faafbfcd56e8', 1793539230005);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (320, '2a91d16a70b0dffd7fae01f7b00e0a81ba05f7d5f0be09da52b0fcb27fd2340f', 1793539230006);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (321, 'ec7c82ab11fb480506014e5c1f32068d40a875305d5280bf3b5a84de6c993e6a', 1793539230007);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (322, 'f92067cb00a91466eeaea0247d136357733c1fc2a00229d47a6cb6b583162281', 1793539230008);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (323, 'a162fbe8a250a90b2180036ccac0e558358ff5b302350bb0904c06bb85684ab0', 1793539230009);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (324, '046cc966b493a25252804e156fb4c190dbafcaa46b6397ea0fad8f7df685a9bc', 1793539230010);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (325, '188b0dcf8bfde8fd00fe1d037c1296125c832573fd26b8d01762dd85b452775f', 1793539230011);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (326, 'dbb7d0469a5a37c41850599269e23d64ed5afa3cd0599f2046d4386c6cf775ad', 1793539230012);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (327, '2f4d0439d64dc91929fedc3853d30790428105d276291b81d004267288a3ff49', 1793539230019);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (328, '76aab407e6771c1eded4ecb8a857fb0be7d4e21df63ccfc989fa6fd6c1cede8e', 1793539230020);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (329, '0ec1e77ef70c458ffaa6bed1d14a8c3e3ed4371ca8aa8e911729453c90e5137e', 1793539230021);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (330, '358212b8bf890a7af208c5a9c499f951a6e126563166042448f0b9cf10039346', 1793539230022);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (331, '43c0600e77e873e24f9d2922fd894d55d1a597c21e714e37e3ef7763b539226c', 1793539230023);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (332, 'bcf1f8bebbc046d79624360f2dcbdd746d1d15761f5673f54f82e1437c005d49', 1793539230024);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (333, 'bfd82dd2a41a703395ca3dafebc01e3db57b93b553d76005cc9d8215dae8ee88', 1793539230025);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (334, 'c00806a35923251876edd04b9c301bed089aa64402437b2e2ebfa6f9822d71d8', 1793539230026);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (335, 'ec7c249be573d423fc5fd429639edad3aeb727cedf013b2f382e4b0caba5e82f', 1793539230027);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (336, '46db9cd975fedfcb39f385ff385913fa545db64592f8035fae9117f37bbc8fe6', 1793539230028);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (337, 'eda4eeb20052597040224c8f68f2d1c76ec2c89d0125667127a7eadfb7294a3d', 1793539230029);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (338, '01d348da263f88f52347d3b3690aa44e6cbae3d2f1b7166162335ffde366f5b5', 1793539230030);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (339, '50ded0f4369d8e446ca187dc1dfa48c545540a1eedf6d5a4d4080067ac83a6ea', 1793539230031);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (340, '5eab504d31fac5a3ca43a9b3772b7964d442122fe7bf8b18d3df5e981d2934ec', 1793539230032);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (341, '80ad856c19b45e8d939e9cbdd2aca503adf5528842aebade0ff23b94a2fa366b', 1793539230033);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (342, '9969fce236ca3e7aaded0d2e386f04f6f5cacd88fd471a10585a222c1f099527', 1793539230034);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (343, '4b8a89f010617a892d1577337487cd7ccc18f3132cd738ed44259da490da4026', 1793539230035);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (344, '8da20c73dc2487c14b6171814981f82d23f70da9e292a1a18ece8dd37591cb69', 1793539230036);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (345, 'a5b431b56af041b52d80f8a85c7a64ff1403ad349020e5b042f944c6a147d628', 1793539230037);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (346, '76380065863112ad715a616d429cd10893f4fd889894752204e9bb88f36ceae0', 1793539230038);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (347, 'd3f73ad97f13f0626e68504b6b0bcb5706d1e2e66829f4004b6fa68955242f59', 1793539230039);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (348, '65b8452875071d9b3232d3b87f3f2549f0279723aaad260cbb35bd15f9ab8b83', 1793539230040);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (349, '8f13654ab79dfe27e89b7fec285e87f4a26d92cc1393e55a3dc94b0e010506c7', 1793539230041);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (350, '1bf329a8534163fc982011edcf2cb2be95179348c93b91dad26e7c284a097199', 1793539230042);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (351, '80ee40f6c7e7eb084d81c7a333cbb8432e631420d44a65c24646a5a0530ecfd6', 1793539230043);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (352, '77f282cc17a9c83e5e7560239ad23b320e882db99c1f532f1eba4524b599504a', 1793539230044);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (353, '1e14a432133feb94bfb7b0e67af08fa7182fc4a6794b1c9ad1b50c599fab03ae', 1793539230045);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (354, '02b75646b783970ce72b3581fd230f8182e144933c745c5d2518ac47b5f9a52f', 1793539230046);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (355, '1d1568af48919854cf46b89487e4fa4037bd2d992b127325f45c1563d750cd23', 1793539230047);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (356, 'a7c7ca96125e4fae7690f927e7890d4756c6212f8345aaf587e3bce5a5a17a2b', 1793539230048);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (357, '6a1228ec022e7f2ed1e63e00ff2edc78a172b34a8a3c45f335068a8fcb009682', 1793539230049);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (358, 'bf945d4597cb5de8f3f9aaa25f1f819216a2c9580652ccbb4c93314050a845e5', 1793539230050);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (359, '481a56eb5786047cc886af2b88f404079b590fa79f5d12682dce894672bb2c2f', 1793539230051);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (360, '7bc37791aa78405ccce8360f4ebefedb71980e76761e4479d0e838760418b122', 1793539230052);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (361, '0a66ce514170472ea360f18929794f80b561c597e5b1a2b9a4857be10d88ffb4', 1793539230053);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (362, 'dd4a7640b4e75b2960cc1a7bdf196e9b8500fac83b2cf65e723d4e0ccc1b4f95', 1793539230054);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (363, '47f78ceeaf1d326d5dcc80973cfab8350939e577fa74f932c749abe2818cfaa1', 1793539230055);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (364, '3f2d95bfaf41eda17b1dcd1726dbe4c037292e293018644c4953375bd5ec4259', 1793539230056);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (365, 'cc1d4331e11d30c17e6a2dde361bfab470856030fa3b5f0ac8d6ca9bfdcb00f4', 1793539230057);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (366, 'e11d543c516c0bc8923d424fb8490b2d2db7c94f4c10f397ce58d6af6939e872', 1793539230100);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (367, '7ae125a790db04fa9fa5f23733a3aff0b3f790d2cb1d9445d5bd1426d967748e', 1793539230101);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (368, '9781cad9e888b079126a04bd1bbc6e78803ed6ef4dd1f2870bd073392b46ea59', 1793539230102);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (369, '2611641567b01a385877ea771c930fc901c500c6b0127d7e7f9fab0c1d216126', 1793539230103);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (372, '8c2b046d10a545f833c0b127118565a4b8f07a2440060fe11f6074f02da8a89d', 1793539230104);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (378, '8b7105514635473707833133b33f2cbd572a2e802727686de0e5c92967e37d89', 1793539230105);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (379, 'c8f58cdfbfb8f889ffb889663dcef9ccc605c5e0c5c8831f1c08195e6c5d46d9', 1793539230106);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (380, 'e40c41aaece1f4ffb498c18bd416fafb3cb237ceffedce31002a25d03f1d80e8', 1793539230107);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (381, '4f1770dbc9a56cddc267fef0563144da4649cff49aa4ab77a2dd86eea418639b', 1793539230108);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (382, 'eafa40fd665a80da8994a09e42f51468725161e82bf3953df8c235bdd5e4fbd9', 1793539230109);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (391, '17409cf6b734d25404f779bc524f170b9cf71e91b7d2de2d233255c041265abb', 1793539230110);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (392, '682a2cb240fbc0e985e4f91c3b1581d589800a4f481322b64c01260f4b708e75', 1793539230111);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (393, 'e299d9ad03396a940a8f97ee570ff9c214c5ec7cae6cbfa74832d053bf10d34e', 1793539230112);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (394, 'f262f4e649188d9359057b7b24fbe22b1faf274b88a4c800e6df4f18d8281ceb', 1793539230113);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (395, '6852ab4f6a2f1793bdba89eea0160f2c307112bfb5c4426f5ccff04be3d928e5', 1793539230114);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (396, '6b709d7b25c6475c2f00b9812ee4b0ee89232a5d54259f01cd67d1fd11bd9b6e', 1793539230115);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (397, '27f6fcfa532ef2f6647a4ed39168963ddcdca793b40055865e74b79dcf038ba5', 1793539230116);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (398, '9cb46308e68429692b01afe562c1f6ee5ac39650d43152de0f36f023c79626bc', 1793539230117);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (399, 'be98df494f5752e8fe692dc7d722113e75afb41edf2713902cec7b364905a23d', 1793539230118);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (400, '031c82cf3b9493c06cab1d2047c23c97e13da314facc95fb8a2c3e1a437c4094', 1793539230119);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (401, '061a1809ffdec01c3d10284246dd309d2d5fa8616307db5b376ba6f2fea589ec', 1793539230120);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (402, '1850de1aaf612ebc6b0074648858fc4ff45d03f1b4f6e109f3f4bb5649ebb533', 1793539230121);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (403, 'e61dec25c26ee20d89619abb212d4c1f0e8408f3599ae843a097e1296281f121', 1793539230122);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (404, '2044573ed1d5b1e26362ea74d7ec568ffcee4db7ce15bfcc02bc5d1c0f640cee', 1793539230123);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (405, '44a02a0935871fb21532ff3af022846c67b152c1808499f074a9e586bffccb8c', 1793539230124);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (406, '35adfef8ed8d8180c4fbca2078bc75446a8dd9205b4ecc86d51f1f987e973b50', 1793539230125);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (407, '2a79b0249c178de80219be857cf9be5e63dd04ae5b39c27152fe460caf53fdb1', 1793539230126);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (408, '3cb6f94d28d2513b155354c715e00097837893692dc2829b4550f644d267d88c', 1793539230127);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (409, '63ca3467035d61568dc93dc0d07507b1bb2d57f2d1ecc132e5de0d9379482285', 1793539230128);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (410, 'c65517349df73626597b363cdc8f2d1ba6cdbba0f54964bfd891bbe273fae011', 1793539230129);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (411, '6daf6104fcfab885f55a52cced1d262bf87c3c8b8140aae355879e5a4fe16bab', 1793539230130);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (412, '9300323dac25f4cdd5a78052bdbe70bb1845d1be3cea0a3a8847f248ee931a71', 1793539230131);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (413, '743903fa976d7ab8cc5905a0a165f5bf3a70d8320f2ab172d951fc39fe7f1f21', 1793539230132);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (414, '9933cb616ec30e1fd1e194bcfd0b45f3d2c57455f242d1c277f5f37f2f587458', 1793539230133);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (415, '0526856dac8442d97c2f42fd7397e0e5b95f10df080e3eda5295604766a1fec7', 1793539230134);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (416, '304fe8c1c8677e154ae474be73fe98d14c303747ba35f2c0edff19478bd096c6', 1793539230135);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (417, '8367795725f3cf65edff9a0d0d52a0e78a60c4300cf70233f4244436acb3f69a', 1793539230136);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (418, '097670277b72ce99537de7952036e9f4900c1f03a6d550fa084bb4c4185a7379', 1793539230137);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (419, '954cdbde8837f6d79112fe15d7e3974151fe580e24d7dce25f370ddc03d90499', 1793539230138);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (420, '10d6f98b2f8c41aa4694617e0d0fb950b96be92abe8bf880307b26b89c350b8c', 1793539230139);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (421, 'c5604535291f901a20d7e7a34bd6769f017f6f89c13305fd509f61d99596cb48', 1793539230140);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (422, '73e861a6309ba036f681688435aae61f1e1aeb11877f8f2bfd7f6d74d1e8e3d1', 1793539230141);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (423, '7ae79971a658c136277e87f0b0902867b2b129ece62966bb94a5131428ca6330', 1793539230142);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (424, 'a78892d584f80b57254b7aa709147084a8e34357acd65cbfbfdcee635002d32a', 1793539230143);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (425, 'bf885387bb69385018b317278cd3298b5a638057bf180b72dd7f49e15fee4b89', 1793539230144);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (426, 'e331256aefda5ac334b4f881664b517d04e20d568aaa746688325a88daa1f12c', 1793539230145);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (427, '7e73978ae083964bb2b8924c82c7927d564c55288fd05b06b645efa7ad2c81fa', 1793539230146);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (428, 'a00661556ed73e82a85749fceced8acb8b904bd453a84893d6ca1a284057a578', 1793539230147);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (429, '552afc9ef8ca30789e4d0b964254348d01bf2b0c31b56258cd833a6d3c56943a', 1793539230148);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (430, '4877ac8cb2ebf0eace4a77ecbd3625aea7ccdecf16c78e8282a3316b0a93a228', 1793539230149);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (431, '0a6476811927f5830733b2cb948461f5ec0a6dc6a7de2d4c9d3d7e067cbb8814', 1793539230150);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (432, 'c3d77a6bb40ee9cb7692443306929132b15e5fa951e590890eaf038c35316890', 1793539230151);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (433, 'e3c7d1744c690ea8c7deacc330b5c2467f79cd044bd66020c900f8ed71dbb3b7', 1793539230152);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (434, 'dc709a62df5ba30a8ab99cbc7db9d0953ef10ab469c2477e4ca2a530a4931f81', 1793539230153);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (435, '63393f96aac938682225c75c062eafcdc26c4bf0bc7bdb6a97f3fef07326a896', 1793539230154);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (436, 'bc9a95778d1a066c3665227de4c5bd1b6079a9cf3504ac017f297715fd287ff1', 1793539230155);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (437, '8df0d71d58fc74ef081382d79949b73f6d37d4858a39dc539e4ba7bd08521348', 1793539230156);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (438, 'a44582cd1602037906378c52a79ca5735972dc9866db50ab5e496ba85bf8e417', 1793539230157);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (439, '83857e40eef70da05d4738a225d16ce499d0a1480a2dd5209f795faf566ba90e', 1793539230158);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (440, '08e295b3380dee3b19a4b76a6d502467546bf46768c43d3c5f8eab9b2edcf1c6', 1793539230159);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (441, '04c2f72e1d80116f5d5f1d08f62c7b9eff573d9de4303c3c7c98a1e9857b7408', 1793539230160);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (442, 'b9ad7b536f047eec6213350f68c02b2e75e78902ec8bce163c4be037ba3ce62d', 1793539230161);


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: integrator; Owner: -
--

INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('001', '2026-03-04 15:11:18.052247+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('002', '2026-03-04 15:11:18.070713+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('003', '2026-03-04 15:11:18.09237+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('004', '2026-03-04 15:11:18.094868+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('005', '2026-03-04 15:11:18.098054+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('006', '2026-03-04 15:11:18.101089+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('007', '2026-03-04 15:11:18.104803+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('008', '2026-03-04 15:11:18.108804+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('009', '2026-03-04 15:11:18.12114+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('010', '2026-03-04 15:11:18.136121+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('011', '2026-03-04 18:02:34.08836+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260306_0012_create_users.sql', '2026-03-08 02:21:32.555982+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260306_0013_create_identities.sql', '2026-03-08 02:21:32.576372+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260306_0014_create_contacts.sql', '2026-03-08 02:21:32.592248+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260306_0010_add_delivery_attempt_logs.sql', '2026-03-08 16:28:15.577293+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('rubitime:20260306_0009_add_rubitime_tables.sql', '2026-03-08 16:28:15.584616+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('rubitime:20260306_0011_add_rubitime_create_retry_jobs.sql', '2026-03-08 16:28:15.58778+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('telegram:20260306_0009_add_telegram_state_split.sql', '2026-03-08 16:45:48.143713+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('telegram:20260306_0001_init.sql', '2026-03-09 03:06:39.756285+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('telegram:20260306_0002_refactor_telegram_schema.sql', '2026-03-09 03:06:39.767013+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('telegram:20260306_0003_add_user_state.sql', '2026-03-09 03:06:39.769446+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('telegram:20260306_0004_add_notification_settings.sql', '2026-03-09 03:06:39.773135+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('telegram:20260306_0005_add_last_update_id.sql', '2026-03-09 03:06:39.774936+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('telegram:20260306_0006_add_last_start_at.sql', '2026-03-09 03:06:39.776572+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('telegram:20260306_0007_align_mailing_topics.sql', '2026-03-09 03:06:39.778099+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('telegram:20260306_0008_worker_schema.sql', '2026-03-09 03:06:39.779688+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('telegram:20260306_0010_detach_telegram_users_refs.sql', '2026-03-09 03:06:39.780512+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260309_fix_upsert_state_returning.sql', '2026-03-09 04:06:25.762757+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260309_idempotency_keys.sql', '2026-03-09 07:17:56.029667+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('telegram:20260309_0011_backfill_identities_from_telegram_users.sql', '2026-03-09 16:47:57.143381+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('telegram:20260309_0012_backfill_identities_minimal.sql', '2026-03-09 17:12:16.446439+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('telegram:20260309_0013_ensure_telegram_state_for_identities.sql', '2026-03-09 17:23:43.749558+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260310_0001_create_message_threads.sql', '2026-03-09 23:34:46.701397+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260311_0001_create_user_questions.sql', '2026-03-10 00:36:29.08071+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('rubitime:20260310_0002_expand_retry_jobs_for_generic_delivery.sql', '2026-03-10 18:17:52.907598+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260311_0002_create_user_reminders.sql', '2026-03-11 19:08:14.529162+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('telegram:20260311_0015_add_notify_bookings.sql', '2026-03-11 23:17:58.569613+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260319_0001_create_projection_outbox.sql', '2026-03-20 11:25:42.768093+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260319_0002_stage13_freeze_legacy_subscription_tables.sql', '2026-03-20 16:37:13.965013+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260320_0001_outbox_idempotency_key_unique.sql', '2026-03-21 12:01:47.945907+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260320_0002_stage13_freeze_bypass.sql', '2026-03-21 12:01:47.956927+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('rubitime:20260331_0003_booking_calendar_map.sql', '2026-03-31 21:16:18.002703+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('rubitime:20260401_0004_rubitime_booking_profiles.sql', '2026-04-01 13:42:01.872893+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260403_0001_integration_data_quality_incidents.sql', '2026-04-04 03:20:45.102542+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260404_0001_integration_data_quality_branch_tz_reasons.sql', '2026-04-04 03:20:45.114821+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260405_0001_integration_data_quality_stage6_backfill.sql', '2026-04-04 05:18:57.098782+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260406_0002_create_system_settings.sql', '2026-04-04 20:10:33.29531+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('rubitime:20260406_0005_rubitime_branches_timezone.sql', '2026-04-04 20:10:33.308025+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260410_0001_users_merged_into_user_id.sql', '2026-04-10 02:46:42.160686+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260411_0001_oauth_web_login_apple_settings.sql', '2026-04-11 17:50:06.213316+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260413_0001_vk_web_login_url_setting.sql', '2026-04-13 05:47:31.615988+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260413_0002_integrator_grants_public_messenger_canon.sql', '2026-04-14 00:30:46.03716+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260413_0003_integrator_grant_usage_on_public_schema.sql', '2026-04-14 00:30:46.040927+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('rubitime:20260413_0001_rubitime_api_throttle.sql', '2026-04-14 00:30:46.043575+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260414_0001_integrator_idempotency_keys_webapp_columns.sql', '2026-04-14 02:34:39.549579+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260502_0001_notifications_topics_setting.sql', '2026-05-02 16:55:35.050385+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260502_0002_test_account_identifiers_setting.sql', '2026-05-02 16:55:35.056881+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260503_0001_video_hls_pipeline_enabled_setting.sql', '2026-05-05 13:17:23.953901+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260503_0002_video_playback_settings.sql', '2026-05-05 13:17:23.959481+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260504_0001_video_hls_new_uploads_auto_transcode.sql', '2026-05-05 13:17:23.961772+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260505_0001_video_default_delivery_auto.sql', '2026-05-05 13:17:23.963647+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260506_0001_video_presign_ttl_seconds.sql', '2026-05-05 13:17:23.96555+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260507_0001_video_watermark_enabled.sql', '2026-05-05 13:17:23.967198+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260509_0001_reminder_rules_multi_and_enrichment.sql', '2026-05-09 04:30:03.634117+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260509_0002_reminder_rules_quiet_hours.sql', '2026-05-09 17:10:58.950583+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260510_0001_user_reminder_rules_notification_topic_code.sql', '2026-05-11 00:28:28.260228+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260513_0001_video_hls_reconcile_enabled.sql', '2026-05-13 14:27:17.305287+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260515_0001_admin_incident_alert_config.sql', '2026-05-15 05:02:53.8016+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260707_0001_p0_4_i0_integrator_org_columns_predeclare.sql', '2026-07-25 15:31:17.960639+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260708_0001_p0_4_i1_integrator_direct_user_org.sql', '2026-07-25 15:31:22.510517+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260708_0002_p0_4_i2_integrator_identity_path_org.sql', '2026-07-25 15:31:22.541217+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260708_0003_p0_4_i3_integrator_parent_denorm_org.sql', '2026-07-25 15:31:22.556848+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260708_0004_p0_4_i4_integrator_mailings_org.sql', '2026-07-25 15:31:22.665738+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260710_0001_r2_integrator_scoped_org_not_null.sql', '2026-07-25 15:31:22.670698+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260724_0001_rename_rubitime_create_retry_jobs_to_message_retry_jobs.sql', '2026-07-25 15:31:22.683943+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('rubitime:20260724_0002_drop_r7_raw_tables.sql', '2026-07-25 15:31:22.686312+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260727_0002_booking_calendar_map_appointment_key.sql', '2026-07-28 01:47:06.312312+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260729_0001_drop_integrator_system_settings_mirror.sql', '2026-07-30 00:48:08.3831+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260729_0002_drop_system_settings_sync_machinery.sql', '2026-07-30 00:48:08.390402+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260808_0001_drop_legacy_telegram_users.sql', '2026-08-09 17:41:53.819101+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260808_0002_drop_legacy_user_reminder_rules.sql', '2026-08-09 17:41:53.82517+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260808_0003_drop_dead_content_access_grants.sql', '2026-08-09 17:41:53.827552+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260808_0004_drop_legacy_question_messages.sql', '2026-08-09 17:41:53.829877+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260808_0005_drop_legacy_user_questions.sql', '2026-08-09 17:41:53.832105+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260808_0006_drop_legacy_conversation_messages.sql', '2026-08-09 17:41:53.833877+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260808_0007_drop_legacy_conversations.sql', '2026-08-09 17:41:53.835762+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260808_0008_drop_legacy_contacts.sql', '2026-08-09 17:41:53.837506+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260808_0009_drop_legacy_message_retry_jobs.sql', '2026-08-09 17:41:53.839395+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260808_0010_drop_legacy_identities.sql', '2026-08-09 17:41:53.844285+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260808_0011_drop_legacy_users.sql', '2026-08-09 17:41:53.847209+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260808_0012_drop_legacy_telegram_state.sql', '2026-08-09 17:41:53.848981+03');
INSERT INTO integrator.schema_migrations (version, applied_at) VALUES ('core:20260812_0001_offline_drop_legacy_identity.sql', '2026-08-13 00:54:06.586928+03');


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

INSERT INTO public.saas_tariffs (id, name, description, price_minor, currency, mechanics, is_active, created_at, updated_at, included_seats, billing_period, quotas, system_access_policy, mechanic_access_policies, downgrade_policies, additional_seat_price_minor, discounted_price_minor, mailing_templates) VALUES ('d1156dc6-e71e-4225-ad94-93c9d423c9e1', 'ПОЛНЫЙ ДОСТУП - РАЗРАБОТЧИК', '', 0, 'RUB', '{"files": true, "booking": true, "courses": true, "branding": true, "mailings": true, "payments": true, "cms_pages": true, "clinic_team": true, "patient_app": true, "patient_card": true, "custom_domain": true, "subscriptions": true, "exercise_catalog": true, "exercise_packages": true, "patient_app_paid_subscription": true}', true, '2026-07-25 20:15:14.807477+03', '2026-07-25 20:15:14.81+03', 1000, 'year', '{}', NULL, '{}', '{}', NULL, NULL, '[]');
INSERT INTO public.saas_tariffs (id, name, description, price_minor, currency, mechanics, is_active, created_at, updated_at, included_seats, billing_period, quotas, system_access_policy, mechanic_access_policies, downgrade_policies, additional_seat_price_minor, discounted_price_minor, mailing_templates) VALUES ('e07db366-f471-40a5-bc9b-499908636acd', 'СТАРТ', 'Все необходимое для старта. Полноценное сопровождение клиентов, назначение индивидуальных программ, защищенный чат, публичная страница и удобная запись на прием по цене меньше чем сервисы для онлайн-записи.', 80000, 'RUB', '{"files": true, "booking": true, "courses": false, "branding": false, "mailings": false, "payments": false, "cms_pages": false, "clinic_team": false, "patient_app": false, "patient_card": true, "custom_domain": false, "subscriptions": false, "exercise_catalog": true, "exercise_packages": false, "patient_app_paid_subscription": false}', true, '2026-07-26 02:16:33.324227+03', '2026-07-26 02:16:33.333+03', 1, 'month', '{}', NULL, '{}', '{}', NULL, NULL, '[]');
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
INSERT INTO public.saas_tariffs (id, name, description, price_minor, currency, mechanics, is_active, created_at, updated_at, included_seats, billing_period, quotas, system_access_policy, mechanic_access_policies, downgrade_policies, additional_seat_price_minor, discounted_price_minor, mailing_templates) VALUES ('f0000000-0000-4000-8000-000000000001', 'DEV Trial', 'DEV screenshot trial', NULL, NULL, '{}', true, '2026-08-07 12:17:47.713041+03', '2026-08-07 12:17:47.713041+03', NULL, 'month', '{}', NULL, '{}', '{}', NULL, NULL, '[]');
INSERT INTO public.saas_tariffs (id, name, description, price_minor, currency, mechanics, is_active, created_at, updated_at, included_seats, billing_period, quotas, system_access_policy, mechanic_access_policies, downgrade_policies, additional_seat_price_minor, discounted_price_minor, mailing_templates) VALUES ('4110365f-cb50-4d43-8084-3e3d12a29daa', 'TEST-5.1-SEAT-OVERAGE-delete-me', '', NULL, 'RUB', '{"promo": false, "booking": false, "courses": false, "warmups": false, "branding": false, "mailings": false, "payments": false, "cms_pages": false, "custom_domain": false, "online_intake": false, "subscriptions": false, "clinical_tests": false, "exercise_catalog": false, "specialist_tasks": false, "doctor_statistics": false, "exercise_packages": false, "external_calendar": false, "booking_prepayment": false, "patient_home_today": false, "patient_app_paid_subscription": false}', false, '2026-08-01 16:38:24.149746+03', '2026-08-01 16:46:10.753+03', 4, 'month', '{}', NULL, '{}', '{}', 15000, NULL, '[]');
INSERT INTO public.saas_tariffs (id, name, description, price_minor, currency, mechanics, is_active, created_at, updated_at, included_seats, billing_period, quotas, system_access_policy, mechanic_access_policies, downgrade_policies, additional_seat_price_minor, discounted_price_minor, mailing_templates) VALUES ('bc71b639-5409-41b5-b7ab-46a710cf3c35', 'TEST-LADDER-2810-delete-me', 'throwaway for live run 2.8-2.10', NULL, NULL, '{"promo": false, "booking": false, "courses": true, "warmups": false, "branding": false, "mailings": false, "payments": false, "cms_pages": false, "custom_domain": false, "online_intake": false, "subscriptions": false, "clinical_tests": false, "exercise_catalog": false, "specialist_tasks": false, "doctor_statistics": false, "exercise_packages": false, "external_calendar": false, "booking_prepayment": false, "patient_home_today": false, "patient_app_paid_subscription": false}', false, '2026-08-01 16:16:45.872334+03', '2026-08-01 16:18:12.555+03', 1, 'month', '{}', NULL, '{}', '{}', NULL, NULL, '[]');
INSERT INTO public.saas_tariffs (id, name, description, price_minor, currency, mechanics, is_active, created_at, updated_at, included_seats, billing_period, quotas, system_access_policy, mechanic_access_policies, downgrade_policies, additional_seat_price_minor, discounted_price_minor, mailing_templates) VALUES ('b57e10a4-e1ea-4d90-be0a-4a4a9df947b4', 'AUDIT-2.11-PROBE-delete-me', '', 999, 'RUB', '{"promo": false, "booking": false, "courses": false, "warmups": false, "branding": true, "mailings": false, "payments": false, "cms_pages": false, "custom_domain": false, "online_intake": false, "subscriptions": false, "clinical_tests": false, "exercise_catalog": false, "specialist_tasks": false, "doctor_statistics": false, "exercise_packages": false, "external_calendar": false, "booking_prepayment": false, "patient_home_today": false, "patient_app_paid_subscription": false}', false, '2026-08-01 16:44:44.322818+03', '2026-08-02 18:06:20.077+03', 1, 'month', '{}', '{"graceDays": 45, "readOnlyDays": 7, "notifications": [], "terminalState": "read_only"}', '{}', '{}', NULL, NULL, '[]');


--
-- Data for Name: saas_paid_period_policy; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.saas_paid_period_policy (key, post_paid_period_behavior, post_paid_period_tariff_id, is_active, updated_by, created_at, updated_at) VALUES ('global', 'read_only', NULL, true, NULL, '2026-08-07 12:08:32.215146+03', '2026-08-07 12:08:32.215146+03');


--
-- Data for Name: saas_registration_tariff_policy; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.saas_registration_tariff_policy (key, tariff_id, updated_by, created_at, updated_at) VALUES ('global', NULL, '00000000-0000-0000-0000-000000000003', '2026-08-01 15:21:48.076728+03', '2026-08-01 20:43:32.247+03');


--
-- Data for Name: saas_trial_policy; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.saas_trial_policy (key, duration_days, start_event, post_trial_behavior, post_trial_tariff_id, is_active, updated_by, created_at, updated_at, discount_window_days) VALUES ('global', 30, 'organization_provisioned', 'blocked', NULL, true, '9c40e322-5823-4dba-ba98-84b1e9b3aeba', '2026-07-26 02:26:34.787873+03', '2026-07-26 02:26:34.792+03', 0);


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE SET; Schema: drizzle; Owner: -
--

SELECT pg_catalog.setval('drizzle.__drizzle_migrations_id_seq', 442, true);


--
-- PostgreSQL database dump complete
--

\unrestrict 6xzycw3O74f0f9FxN40D7hBJa1BUoZPri2X8OgBphy4ZCgHYN04UzAxR2bLbMUg

