import type { CourseProductId, Lesson, Product, Series } from './index';

export type Category = {
  id: string;
  title: string;
};

export type Catalog = {
  products: Record<CourseProductId, Product>;
  series: Record<'super' | 'anbu' | 'douyin', Series>;
  categories: readonly Category[];
};

export const COURSE_RELEASE_BASE =
  'https://github.com/85373166jin-source/unknown-useful-site/releases/download/course-videos-20260920';

function buildLessons(seriesId: 'super' | 'anbu', count: number): Lesson[] {
  return Array.from({ length: count }, (_, index) => {
    const order = index + 1;
    const padded = String(order).padStart(2, '0');
    return {
      id: `${seriesId}-${padded}`,
      title: `第 ${order} 课`,
      mediaPath: `${COURSE_RELEASE_BASE}/${seriesId}-${padded}.mp4`,
      coverPath: `/media/covers/${seriesId}-${padded}.webp`,
      order
    };
  });
}

const superLessons = buildLessons('super', 18);
const anbuLessons = buildLessons('anbu', 31);

const DOUYIN_RELEASE_BASE =
  'https://github.com/85373166jin-source/unknown-useful-site/releases/download/resource-videos-20260923';

const douyinLessons: Lesson[] = [
  {
    id: 'douyin-01',
    title: '完整注册流程',
    mediaPath: `${DOUYIN_RELEASE_BASE}/douyin-01.mp4`,
    coverPath: '/media/covers/douyin-01.webp',
    order: 1
  },
  {
    id: 'douyin-02',
    title: '注意事项与补充',
    mediaPath: `${DOUYIN_RELEASE_BASE}/douyin-02.mp4`,
    coverPath: '/media/covers/douyin-02.webp',
    order: 2
  }
];

export const CATALOG = {
  products: {
    super: {
      id: 'super',
      title: '超影课程',
      priceYuan: 29,
      productType: 'course',
      status: 'active',
      categoryId: 'courses',
      description: '18 个视频、封面选集、在线播放、单课评论与下载'
    },
    anbu: {
      id: 'anbu',
      title: '暗部课程',
      priceYuan: 29,
      productType: 'course',
      status: 'active',
      categoryId: 'courses',
      description: '31 个视频、封面选集、在线播放、单课评论与下载'
    },
    bundle: {
      id: 'bundle',
      title: '火影合集',
      priceYuan: 49,
      productType: 'course',
      status: 'presale',
      categoryId: 'courses',
      description: '超影课程 18 节加暗部课程 31 节'
    },
    douyin: {
      id: 'douyin',
      title: '无限注册抖音新号',
      priceYuan: 19,
      productType: 'digital',
      status: 'active',
      categoryId: 'digital',
      description: '2 个视频、完整注册流程、注意事项与下载'
    }
  },
  series: {
    super: {
      id: 'super',
      title: '超影课程',
      status: 'active',
      lessons: superLessons
    },
    anbu: {
      id: 'anbu',
      title: '暗部课程',
      status: 'active',
      lessons: anbuLessons
    },
    douyin: {
      id: 'douyin',
      title: '无限注册抖音新号',
      status: 'active',
      lessons: douyinLessons
    }
  },
  categories: [
    { id: 'all', title: '全部资源' },
    { id: 'courses', title: '在线课程' },
    { id: 'tools', title: '工具服务' },
    { id: 'memberships', title: '会员权益' },
    { id: 'digital', title: '数字资源' },
    { id: 'free', title: '免费专区' }
  ]
} as const satisfies Catalog;
