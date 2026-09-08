/* global interfaceConfig */

// Bind-mounted into ${CONFIG}/web/custom-interface_config.js — same append-on-start mechanism as
// custom-config.js. Branding removal (VM-06): no Jitsi name/logo/watermark anywhere in the call UI.
interfaceConfig.SHOW_JITSI_WATERMARK = false;
interfaceConfig.SHOW_WATERMARK_FOR_GUESTS = false;
interfaceConfig.SHOW_BRAND_WATERMARK = false;
interfaceConfig.SHOW_POWERED_BY = false;
interfaceConfig.DEFAULT_LOGO_URL = '';
interfaceConfig.DEFAULT_WELCOME_PAGE_LOGO_URL = '';
interfaceConfig.APP_NAME = 'Video';
interfaceConfig.NATIVE_APP_NAME = 'Video';
interfaceConfig.PROVIDER_NAME = '';

// Toolbar allowlist mirrors config.js's toolbarButtons; kept here too since some Jitsi releases read the
// button list from interfaceConfig instead.
interfaceConfig.TOOLBAR_BUTTONS = ['microphone', 'camera', 'hangup', 'desktop', 'toggle-camera', 'fullscreen', 'settings', 'filmstrip', 'tileview', 'videoquality', 'select-background'];
interfaceConfig.SETTINGS_SECTIONS = [];
interfaceConfig.DISABLE_JOIN_LEAVE_NOTIFICATIONS = true;
interfaceConfig.DISABLE_TRANSCRIPTION_SUBTITLES = true;
interfaceConfig.DISABLE_VIDEO_BACKGROUND = true;
interfaceConfig.HIDE_INVITE_MORE_HEADER = true;
interfaceConfig.MOBILE_APP_PROMO = false;
interfaceConfig.RECENT_LIST_ENABLED = false;
interfaceConfig.DISPLAY_WELCOME_FOOTER = false;
interfaceConfig.DISABLE_PRESENCE_STATUS = true;
interfaceConfig.GENERATE_ROOMNAMES_ON_WELCOME_PAGE = false;
interfaceConfig.SHOW_CHROME_EXTENSION_BANNER = false;
