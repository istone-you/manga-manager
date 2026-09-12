export type MicroCmsImage = {
  url: string;
  height: number;
  width: number;
};

export type Magazine = {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
  revisedAt?: string;
  name: string;
  logo: MicroCmsImage;
  label?: string;
  group?: Magazine[];
  publisher?: string[];
};

export type MangaCover = {
  fieldId: "cover";
  cover?: string;
  title?: string;
  not_owned?: boolean;
};

export type Manga = {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
  revisedAt?: string;
  title: string;
  is_serialized?: boolean;
  magazine?: Magazine | null;
  is_transferred?: Magazine | null;
  covers: MangaCover[];
};

export type ListResponse<T> = {
  contents: T[];
  totalCount: number;
  offset: number;
  limit: number;
};
