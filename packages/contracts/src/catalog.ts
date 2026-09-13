import type { CourseProductId, Lesson, Product, Series } from './index';

export type Category = {
  id: string;
  title: string;
};

export type Catalog = {
  products: Record<CourseProductId, Product>;
  series: Record<'super' | 'anbu', Series>;
  categories: readonly Category[];
};

const superLessons: Lesson[] = Array.from({ length: 9 }, (_, index) => {
  const order = index + 1;
  const padded = String(order).padStart(2, '0');
  return {
    id: `super-${padded}`,
    title: `第 ${order} 课`,
    mediaPath: `/media/super-shadow/${order}.mp4`,
    order
  };
});

export const CATALOG = {
  products: {
    super: {
      id: 'super',
      title: '超影课程',
      priceYuan: 29,
      productType: 'course',
      status: 'active',
      categoryId: 'courses',
      description: '9 个视频、在线播放、下载、进度同步'
    },
    anbu: {
      id: 'anbu',
      title: '暗部课程',
      priceYuan: 29,
      productType: 'course',
      status: 'coming_soon',
      categoryId: 'courses',
      description: '素材到位后配置视频与课程密码'
    },
    bundle: {
      id: 'bundle',
      title: '火影合集',
      priceYuan: 49,
      productType: 'course',
      status: 'presale',
      categoryId: 'courses',
      description: '超影课程权益加暗部课程权益'
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
      status: 'coming_soon',
      lessons: []
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
