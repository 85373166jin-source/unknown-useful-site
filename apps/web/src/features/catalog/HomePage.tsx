import { useEffect, useState } from 'react';
import { CATALOG, type Category } from '@site/contracts';
import { apiFetch } from '../../lib/api';
import { ResourceCard, type Resource } from '../../components/ResourceCard';

const RESOURCES: Resource[] = [
  {
    id: 'fire-shadow',
    title: '火影课程',
    description: '超影课程与暗部课程，合集支持预售',
    badge: '已上线',
    href: '/courses/fire-shadow'
  },
  {
    id: 'free',
    title: '免费资源专区',
    description: '免费工具与学习资料整理中',
    badge: '免费'
  },
  {
    id: 'tools',
    title: '软件代装服务',
    description: '常用软件安装与环境配置服务',
    badge: '规划中'
  },
  {
    id: 'memberships',
    title: '平台会员权益',
    description: 'VIP 与 SVIP 会员权益已上线',
    badge: '已上线',
    href: '/membership'
  }
];

interface CatalogPayload {
  categories: Category[];
}

export function HomePage() {
  const [categories, setCategories] = useState<Category[]>(() =>
    CATALOG.categories.map((category) => ({ ...category }))
  );

  useEffect(() => {
    let cancelled = false;

    apiFetch<CatalogPayload>('/catalog')
      .then((payload) => {
        if (!cancelled && Array.isArray(payload.categories)) {
          setCategories(payload.categories);
        }
      })
      .catch(() => {
        // Keep the static CATALOG categories when the API is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="home-page">
      <section className="home-hero">
        <h1 className="home-hero__title">某不知名有用的网站</h1>
        <p className="home-hero__subtitle">精品资源整理中，课程、工具与会员权益一站直达</p>
        <input
          className="home-search"
          type="search"
          placeholder="搜索课程、工具或资源"
          aria-label="搜索资源"
        />
      </section>

      <div className="home-layout">
        <aside className="home-categories" aria-label="资源分类">
          <ul className="home-categories__list">
            {categories.map((category) => (
              <li key={category.id}>
                <button type="button" className="home-categories__chip">
                  {category.title}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="home-resources">
          {RESOURCES.map((resource) => (
            <ResourceCard key={resource.id} product={resource} />
          ))}
        </div>
      </div>
    </div>
  );
}