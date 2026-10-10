export interface BlogImage {
  alt?: string | null;
  url?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface ArticleCard {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  publishedAt: string;
  updatedAt?: string | null;
  category?: { title: string; slug: string } | null;
  author?: { name: string; role?: string | null } | null;
  cover?: BlogImage | null;
}

export interface Article extends ArticleCard {
  seoTitle?: string | null;
  seoDescription?: string | null;
  _updatedAt: string;
  body: unknown[];
}
