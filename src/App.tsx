import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  Grid3X3,
  Library,
  List,
  Search,
  Tags,
  TriangleAlert,
  X
} from "lucide-react";
import type { Magazine, Manga } from "./types";

type StatusFilter = "all" | "serialized" | "completed" | "transferred";
type ViewMode = "cards" | "list";
type PageMode = "library" | "unowned";

const isSingleVolumeCollection = (manga: Manga) => manga.id === "single";

type CardEntry = {
  id: string;
  title: string;
  cover?: string;
  meta: string;
  badge?: string;
  countBadge: string;
  tag?: string;
  accent?: boolean;
};

type AppProps = {
  manga: Manga[];
  magazines: Magazine[];
  showingDrafts: boolean;
};

export function App({ manga, magazines, showingDrafts }: AppProps) {
  const [query, setQuery] = useState("");
  const [publisher, setPublisher] = useState("all");
  const [magazineId, setMagazineId] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [selectedId, setSelectedId] = useState<string | null>(manga[0]?.id ?? null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDetailClosing, setIsDetailClosing] = useState(false);
  const [pageMode, setPageMode] = useState<PageMode>("library");

  useEffect(() => {
    const handleHashChange = () => {
      setPageMode(window.location.hash === "#unowned" ? "unowned" : "library");
    };

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const publishers = useMemo(() => {
    return Array.from(
      new Set(
        magazines.flatMap((magazine) => magazine.publisher ?? []).filter((item) => item.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b, "ja"));
  }, [magazines]);

  const availableMagazines = useMemo(() => {
    if (publisher === "all") {
      return magazines;
    }

    return magazines.filter((magazine) => magazine.publisher?.includes(publisher) === true);
  }, [magazines, publisher]);

  useEffect(() => {
    if (
      magazineId !== "all" &&
      !availableMagazines.some((magazine) => magazine.id === magazineId)
    ) {
      setMagazineId("all");
    }
  }, [availableMagazines, magazineId]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return manga.filter((item) => {
      const titleMatch =
        normalizedQuery.length === 0 ||
        item.title.toLowerCase().includes(normalizedQuery) ||
        item.covers.some((cover) => cover.title?.toLowerCase().includes(normalizedQuery));
      const publisherMatch =
        publisher === "all" || item.magazine?.publisher?.includes(publisher) === true;
      const magazineMatch = magazineId === "all" || item.magazine?.id === magazineId;
      const statusMatch =
        status === "all" ||
        (status === "serialized" && item.is_serialized === true) ||
        (status === "completed" && item.is_serialized !== true) ||
        (status === "transferred" && item.is_transferred !== null && item.is_transferred !== undefined);

      return titleMatch && publisherMatch && magazineMatch && statusMatch;
    });
  }, [magazineId, manga, publisher, query, status]);

  const selected = manga.find((item) => item.id === selectedId) ?? null;
  const ownedVolumes = manga.reduce(
    (sum, item) => sum + item.covers.filter((cover) => cover.not_owned !== true).length,
    0
  );
  const serializedCount = manga.filter((item) => item.is_serialized).length;

  const unownedManga = useMemo(() => {
    return filtered
      .map((item) => ({
        item,
        unownedCount: item.covers.filter((cover) => cover.not_owned === true).length
      }))
      .filter((entry) => entry.unownedCount > 0);
  }, [filtered]);

  const unownedTotal = unownedManga.reduce((sum, entry) => sum + entry.unownedCount, 0);

  const cards: CardEntry[] = useMemo(() => {
    if (pageMode === "library") {
      return filtered.map((item) => {
        const owned = item.covers.filter((cover) => cover.not_owned !== true);
        const singleVolumeCollection = isSingleVolumeCollection(item);
        return {
          id: item.id,
          title: item.title,
          cover: (owned[0] ?? item.covers[0])?.cover,
          meta: singleVolumeCollection
            ? `${owned.length}作品`
            : `${item.magazine?.name ?? "雑誌未設定"} / ${owned.length}巻`,
          badge: !singleVolumeCollection && item.is_serialized ? "連載中" : undefined,
          countBadge: String(owned.length),
          tag: !singleVolumeCollection && item.is_serialized ? "連載中" : undefined
        };
      });
    }

    return unownedManga.map(({ item, unownedCount }) => {
      const singleVolumeCollection = isSingleVolumeCollection(item);
      return {
        id: item.id,
        title: item.title,
        cover: item.covers.find((cover) => cover.not_owned === true)?.cover,
        meta: singleVolumeCollection
          ? `全${item.covers.length}作品`
          : `${item.magazine?.name ?? "雑誌未設定"} / 全${item.covers.length}巻`,
        countBadge: String(unownedCount),
        tag: `未所持${unownedCount}件`,
        accent: true
      };
    });
  }, [filtered, pageMode, unownedManga]);

  const closeDetail = () => {
    setIsDetailClosing(true);
    window.setTimeout(() => {
      setIsDetailOpen(false);
      setIsDetailClosing(false);
    }, 180);
  };

  useEffect(() => {
    if (!isDetailOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDetail();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isDetailOpen]);

  return (
    <main className="appShell">
      <section className="sidebar" aria-label="漫画ライブラリの操作">
        <div className="brandBlock">
          <div className="brandIcon">
            <Library size={18} aria-hidden="true" />
          </div>
          <div>
            <h1>漫画管理</h1>
          </div>
        </div>

        <div className="statsGrid" aria-label="集計">
          <Stat icon={<BookOpen size={18} />} label="作品" value={manga.length} />
          <Stat icon={<CheckCircle2 size={18} />} label="所持巻" value={ownedVolumes} />
          <Stat icon={<Tags size={18} />} label="連載中" value={serializedCount} />
        </div>

        <div className="pageSwitch" aria-label="ページ切り替え">
          <button
            type="button"
            className="pageSwitchButton"
            aria-pressed={pageMode === "library"}
            onClick={() => {
              window.location.hash = "";
              setPageMode("library");
            }}
          >
            <Library size={17} aria-hidden="true" />
            <span>ライブラリ</span>
          </button>
          <button
            type="button"
            className="pageSwitchButton"
            aria-pressed={pageMode === "unowned"}
            onClick={() => {
              window.location.hash = "unowned";
              setPageMode("unowned");
            }}
          >
            <TriangleAlert size={17} aria-hidden="true" />
            <span>未所持</span>
          </button>
        </div>

        <div className="filterPanel">
          <label className="searchBox">
            <Search size={18} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="作品名・巻名で検索"
            />
          </label>

          <div className="fieldGroup">
            <label htmlFor="publisher">出版社</label>
            <select id="publisher" value={publisher} onChange={(event) => setPublisher(event.target.value)}>
              <option value="all">すべて</option>
              {publishers.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="fieldGroup">
            <label htmlFor="magazine">雑誌</label>
            <select id="magazine" value={magazineId} onChange={(event) => setMagazineId(event.target.value)}>
              <option value="all">すべて</option>
              {availableMagazines.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className="fieldGroup">
            <label htmlFor="status">状態</label>
            <select
              id="status"
              value={status}
              onChange={(event) => setStatus(event.target.value as StatusFilter)}
            >
              <option value="all">すべて</option>
              <option value="serialized">連載中</option>
              <option value="completed">完結・未連載</option>
              <option value="transferred">移籍済</option>
            </select>
          </div>
        </div>
      </section>

      <section className="contentArea">
        <header className="toolbar">
          <div>
            <h2>
              {pageMode === "library"
                ? `${filtered.length}件の作品`
                : `${unownedManga.length}件の作品（${unownedTotal}件の未所持）`}
            </h2>
          </div>
          <div className="toolbarActions">
            {showingDrafts && <span className="draftBadge">下書き表示中</span>}
            <div className="viewSwitch" aria-label="表示形式">
              <button
                type="button"
                aria-label="カード表示"
                aria-pressed={viewMode === "cards"}
                onClick={() => setViewMode("cards")}
              >
                <Grid3X3 size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="リスト表示"
                aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}
              >
                <List size={19} aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        <div className="libraryLayout">
            <div
              className="mangaGrid"
              data-view={viewMode}
              aria-label={pageMode === "library" ? "漫画一覧" : "未所持一覧"}
            >
              {cards.map((card) => (
                <button
                  className="mangaCard"
                  key={card.id}
                  onClick={() => {
                    setSelectedId(card.id);
                    setIsDetailClosing(false);
                    setIsDetailOpen(true);
                  }}
                  type="button"
                >
                  <span className="mangaCover">
                    {card.cover ? (
                      <img src={card.cover} alt="" onError={(event) => event.currentTarget.remove()} />
                    ) : null}
                    {card.badge && viewMode === "cards" && (
                      <span className="coverBadge" data-accent={card.accent}>
                        {card.badge}
                      </span>
                    )}
                    {viewMode === "cards" && (
                      <span className="coverCountBadge" data-accent={card.accent}>
                        {card.countBadge}
                      </span>
                    )}
                  </span>
                  <span className="mangaCardBody">
                    <strong>{card.title}</strong>
                    {viewMode === "list" && (
                      <span className="mangaMetaRow">
                        <span className="mangaMetaText">{card.meta}</span>
                        {card.tag && (
                          <span className="listStatusTag" data-accent={card.accent}>
                            {card.tag}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                </button>
              ))}
              {cards.length === 0 && (
                <div className="emptyState">
                  {pageMode === "library" ? "条件に合う作品がありません" : "未所持の巻はありません"}
                </div>
              )}
            </div>
        </div>
      </section>

      {isDetailOpen && selected && (
        <div
          className="modalBackdrop"
          data-closing={isDetailClosing}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDetail();
            }
          }}
        >
          <article className="detailModal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
            <div className="modalTopbar">
              <button className="closeButton" onClick={closeDetail} type="button" aria-label="閉じる">
                <X size={22} aria-hidden="true" />
              </button>
            </div>
            <MangaDetail manga={selected} pageMode={pageMode} />
          </article>
        </div>
      )}
    </main>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="statItem">
      <span>{icon}</span>
      <strong>{value.toLocaleString("ja-JP")}</strong>
      <small>{label}</small>
    </div>
  );
}

function MangaDetail({ manga, pageMode }: { manga: Manga; pageMode: PageMode }) {
  const singleVolumeCollection = isSingleVolumeCollection(manga);
  const volumes = manga.covers
    .map((cover, index) => ({ cover, volumeNumber: index + 1 }))
    .filter(({ cover }) => (pageMode === "unowned" ? cover.not_owned === true : cover.not_owned !== true));

  return (
    <>
      <div className="detailHeader">
        <div>
          <p className="eyebrow">
            {singleVolumeCollection
              ? "1巻で完結する作品"
              : manga.magazine?.publisher?.join(" / ") ?? "出版社未設定"}
          </p>
          <h2 id="detail-title">{manga.title}</h2>
        </div>
        <div className="detailMeta">
          {pageMode === "unowned" && <span data-accent="true">未所持{volumes.length}件</span>}
          <span>
            {singleVolumeCollection ? `${volumes.length}作品` : manga.is_serialized ? "連載中" : "完結・未連載"}
          </span>
          {!singleVolumeCollection && manga.is_transferred && <span>移籍済</span>}
        </div>
      </div>

      {!singleVolumeCollection && manga.magazine && (
        <div className="magazineStrip">
          <img src={manga.magazine.logo.url} alt="" />
          <div>
            <strong>{manga.magazine.name}</strong>
          </div>
        </div>
      )}

      <div className="coversGrid">
        {volumes.map(({ cover, volumeNumber }) => (
          <figure className="coverCard" key={`${cover.cover}-${volumeNumber}`}>
            <div className="coverImage">
              {cover.cover ? <img src={cover.cover} alt={cover.title ?? `${manga.title} ${volumeNumber}巻`} /> : null}
            </div>
            <figcaption>
              {cover.title ??
                (singleVolumeCollection ? `1巻完結作品 ${volumeNumber}` : `${manga.title} ${volumeNumber}巻`)}
            </figcaption>
          </figure>
        ))}
        {volumes.length === 0 && (
          <div className="emptyState">{pageMode === "unowned" ? "未所持の巻はありません" : "所持している巻はありません"}</div>
        )}
      </div>
    </>
  );
}
