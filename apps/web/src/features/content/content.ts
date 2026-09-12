export const CONTENT_KEYS = [
  'about',
  'contact',
  'purchase-help',
  'terms',
  'privacy',
  'disclaimer'
] as const;

export type ContentKey = (typeof CONTENT_KEYS)[number];

export interface ContentBlock {
  heading?: string;
  paragraphs: string[];
}

export interface StaticContent {
  title: string;
  intro?: string;
  blocks: ContentBlock[];
}

export const STATIC_CONTENT: Record<ContentKey, StaticContent> = {
  about: {
    title: '关于网站',
    intro: '某不知名有用的网站整理实用的课程、工具和会员权益，第一期先上线火影课程。',
    blocks: [
      {
        heading: '内容方向',
        paragraphs: ['课程、工具服务、会员权益和数字资源会逐步补充，所有公开信息都可以先浏览再决定是否使用。']
      },
      {
        heading: '账号与权益',
        paragraphs: ['课程密码和付款购买都会绑定到当前账号，登录后可以跨设备继续观看已拥有的内容。']
      }
    ]
  },
  contact: {
    title: '联系方式',
    intro: '如在使用中遇到问题，可以通过付款时填写的联系方式与站长核对订单。',
    blocks: [
      {
        heading: '订单核对',
        paragraphs: ['提交付款申请后，请保留付款截图和订单号，方便人工核对到账。']
      },
      {
        heading: '人工处理',
        paragraphs: ['审核和密码发放由站长人工完成，通常会在看到申请后尽快处理。']
      }
    ]
  },
  'purchase-help': {
    title: '购买说明',
    intro: '课程支持课程密码解锁和收款码付款两种方式，付款后由站长人工审核。',
    blocks: [
      {
        heading: '使用课程密码观看',
        paragraphs: ['输入正确课程密码后，课程会永久绑定当前账号，之后无需重复输入。']
      },
      {
        heading: '收款码付款',
        paragraphs: ['选择课程后按页面金额扫码付款，并在转账备注中填写订单号。']
      },
      {
        heading: '提交截图审核',
        paragraphs: ['付款完成后填写付款时间、联系方式，并上传付款截图。']
      },
      {
        heading: '人工发放课程密码',
        paragraphs: ['管理员核对到账后会审核订单，并人工发放课程密码或直接开通课程权益。']
      }
    ]
  },
  terms: {
    title: '用户协议',
    intro: '使用本网站前请阅读以下约定。',
    blocks: [
      {
        heading: '账号使用',
        paragraphs: ['请妥善保管账号和密码，不要共享账号或将课程内容用于未授权的传播。']
      },
      {
        heading: '内容使用',
        paragraphs: ['课程内容仅供购买账号学习使用，下载和播放均受网站规则约束。']
      }
    ]
  },
  privacy: {
    title: '隐私说明',
    intro: '网站只保存提供服务所必需的信息。',
    blocks: [
      {
        heading: '联系方式',
        paragraphs: ['手机号和邮箱为选填项，仅用于账号找回和订单核对，并以脱敏形式展示。']
      },
      {
        heading: '数据使用',
        paragraphs: ['登录、订单和观看进度仅用于账号服务和内容解锁，不对外出售。']
      }
    ]
  },
  disclaimer: {
    title: '免责声明',
    intro: '请理解人工审核和静态资源分发方式带来的限制。',
    blocks: [
      {
        heading: '人工审核',
        paragraphs: ['付款申请由站长人工审核，具体到账和开通时间以实际核对结果为准。']
      },
      {
        heading: '资源分发',
        paragraphs: ['课程视频通过公开静态目录分发，请勿将视频地址用于未授权传播。']
      }
    ]
  }
};