export const SITE_SETTINGS_DEFAULTS = {
  siteTitle: '小猪anna的秘密基地',
  navbarLogoUrl: '/annapiggy-logo.png',
  faviconUrl: '/favicon.ico',
  creatorDisplayName: '小猪anna',
  bilibiliUid: '',
  homeTitle: '欢迎来到小猪anna的秘密基地',
  homeSubtitle: '音乐、心意与每一份支持，都值得被认真收藏。',
  playlistCardTitle: '网页歌单',
  playlistCardDescription: '浏览曲目、标签与演唱信息。',
  marshmallowCardTitle: '棉花糖',
  marshmallowCardDescription: '匿名送达想说的话，登录后还能查看回复。',
  prizeCardTitle: '积分商城',
  prizeCardDescription: '使用社区积分兑换限定奖品。',
  playlistTitle: '小猪anna的歌单',
  playlistSubtitle: '想听什么，就从这里开始。',
  marshmallowTitle: '棉花糖',
  marshmallowSubtitle: '写下一封匿名来信。',
  icpText: '',
  publicSecurityText: '',
  primaryColor: '#b83a4f',
  lightColor: '#b98ba0',
  darkColor: '#2b2028',
  backgroundColor: '#f7f4f6',
  backgroundAccentColor: '#eaf1ef',
  textDarkColor: '#2b272a',
  textLightColor: '#6f676c',
  borderSoftColor: '#d9d2d6',
  surfaceSubtleColor: '#ffffff',
  surfaceMutedColor: '#f0ecef',
  successColor: '#27785d',
  warningColor: '#9a671f',
  dangerColor: '#b83a4f',
};

const createThemePreset = (preset) => ({
  ...preset,
  swatches: preset.swatches || [
    preset.values.darkColor,
    preset.values.primaryColor,
    preset.values.lightColor,
    preset.values.backgroundAccentColor,
    preset.values.backgroundColor
  ]
});

export const SITE_THEME_COLOR_SECTIONS = [
  {
    title: '主题主色',
    description: '控制网站主要品牌氛围、背景渐变和视觉主轴。',
    fields: [
      { name: 'primaryColor', label: '主色' },
      { name: 'lightColor', label: '浅色' },
      { name: 'darkColor', label: '深色强调' },
      { name: 'backgroundColor', label: '背景浅色' },
      { name: 'backgroundAccentColor', label: '背景渐变辅色' }
    ]
  },
  {
    title: '界面基础色',
    description: '控制文本、边框和卡片表面层的层次感。',
    fields: [
      { name: 'textDarkColor', label: '主文本色' },
      { name: 'textLightColor', label: '次级文本色' },
      { name: 'borderSoftColor', label: '柔和边框色' },
      { name: 'surfaceSubtleColor', label: '浅表面色' },
      { name: 'surfaceMutedColor', label: '弱表面色' }
    ]
  },
  {
    title: '状态色',
    description: '统一成功、警告和危险状态的按钮、提示与标记色。',
    fields: [
      { name: 'successColor', label: '成功色' },
      { name: 'warningColor', label: '警告色' },
      { name: 'dangerColor', label: '危险色' }
    ]
  }
];

export const SITE_THEME_PRESETS = [
  createThemePreset({
    key: 'crimson-nocturne',
    name: '绯夜银玫',
    description: '黑银底配暗红点缀，适合主播主页的固定深色主视觉。',
    values: {
      primaryColor: '#b83a4f',
      lightColor: '#d8c7cf',
      darkColor: '#09070b',
      backgroundColor: '#151217',
      backgroundAccentColor: '#26181f',
      textDarkColor: '#f6eef3',
      textLightColor: '#b6a8b1',
      borderSoftColor: '#3d3139',
      surfaceSubtleColor: '#1d181e',
      surfaceMutedColor: '#272129',
      successColor: '#4e8f69',
      warningColor: '#b98952',
      dangerColor: '#d86172'
    }
  }),
  createThemePreset({
    key: 'rose-reliquary',
    name: '玫瑰圣坛',
    description: '更厚重的酒红黑调，适合更哥特的氛围。',
    values: {
      primaryColor: '#8f2d43',
      lightColor: '#d7c2c8',
      darkColor: '#08060a',
      backgroundColor: '#141015',
      backgroundAccentColor: '#2a171e',
      textDarkColor: '#f5edf2',
      textLightColor: '#bda6ae',
      borderSoftColor: '#413038',
      surfaceSubtleColor: '#1b151b',
      surfaceMutedColor: '#261d25',
      successColor: '#4b8063',
      warningColor: '#b27a43',
      dangerColor: '#c95468'
    }
  }),
  createThemePreset({
    key: 'moonlit-violet',
    name: '月影紫雾',
    description: '在黑底上保留一点冷紫，适合更偏神秘的主播感。',
    values: {
      primaryColor: '#8d4a9d',
      lightColor: '#d2cadc',
      darkColor: '#08070d',
      backgroundColor: '#14131a',
      backgroundAccentColor: '#1f1930',
      textDarkColor: '#f1edf6',
      textLightColor: '#afa7bb',
      borderSoftColor: '#373245',
      surfaceSubtleColor: '#1a1820',
      surfaceMutedColor: '#23202c',
      successColor: '#4b8068',
      warningColor: '#b38950',
      dangerColor: '#ca6577'
    }
  }),
  createThemePreset({
    key: 'black-garnet',
    name: '黑曜石榴',
    description: '更克制的石榴红和冷黑灰，适合极简深色舞台感。',
    values: {
      primaryColor: '#a04646',
      lightColor: '#d7d0d0',
      darkColor: '#050507',
      backgroundColor: '#111214',
      backgroundAccentColor: '#221818',
      textDarkColor: '#f4f0f0',
      textLightColor: '#b7b0b2',
      borderSoftColor: '#373235',
      surfaceSubtleColor: '#17181b',
      surfaceMutedColor: '#202327',
      successColor: '#4d8364',
      warningColor: '#ad8350',
      dangerColor: '#c45a5f'
    }
  })
];
