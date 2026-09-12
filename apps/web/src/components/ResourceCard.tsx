import { Link } from 'react-router-dom';
import type { Product } from '@site/contracts';

export interface Resource {
  id: string;
  title: string;
  description: string;
  badge?: string;
  href?: string;
}

export type ResourceCardItem = Product | Resource;

export interface ResourceCardProps {
  product: ResourceCardItem;
}

function isProduct(item: ResourceCardItem): item is Product {
  return 'priceYuan' in item;
}

function badgeFor(item: ResourceCardItem): string | undefined {
  if (isProduct(item)) {
    if (item.status === 'active') {
      return '已上线';
    }
    if (item.status === 'presale') {
      return '可预售';
    }
    return '待上线';
  }

  return item.badge;
}

export function ResourceCard({ product }: ResourceCardProps) {
  const href = isProduct(product) ? undefined : product.href;
  const badge = badgeFor(product);

  const body = (
    <>
      {badge ? <span className="resource-card__badge">{badge}</span> : null}
      <h3 className="resource-card__title">{product.title}</h3>
      <p className="resource-card__description">{product.description}</p>
      <span className="resource-card__meta">
        {href ? '查看详情' : isProduct(product) ? `${product.priceYuan} 元` : '敬请期待'}
      </span>
    </>
  );

  if (href) {
    return (
      <Link className="resource-card resource-card--link" to={href}>
        {body}
      </Link>
    );
  }

  return <article className="resource-card">{body}</article>;
}