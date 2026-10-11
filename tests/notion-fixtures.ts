import type {
  DataSourceObjectResponse,
  DatabaseObjectResponse,
  PageObjectResponse,
  SearchResponse,
} from "@notionhq/client";
import type { ReadOnlyNotion } from "../app/lib/notion/gateway";
export const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rich = (value: string): DataSourceObjectResponse["title"] => [
  {
    type: "text",
    text: { content: value, link: null },
    plain_text: value,
    href: null,
    annotations: {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      code: false,
      color: "default",
    },
  },
];
export function source(
  n = 1,
  title = "مكتبة القراءة",
): DataSourceObjectResponse {
  return {
    object: "data_source",
    id: id(n),
    title: rich(title),
    description: rich("DO_NOT_STORE_DESCRIPTION"),
    parent: { type: "database_id", database_id: id(99) },
    database_parent: { type: "page_id", page_id: id(88) },
    is_inline: false,
    database_type: null,
    in_trash: false,
    archived: false,
    created_time: "2026-10-11T10:00:00Z",
    last_edited_time: "2026-10-11T11:00:00Z",
    created_by: { object: "user", id: id(90) },
    last_edited_by: { object: "user", id: id(90) },
    icon: null,
    cover: null,
    url: "https://notion.so/" + id(n),
    public_url: null,
    properties: {
      Name: {
        id: "title",
        name: "Name",
        description: null,
        type: "title",
        title: {},
      },
      Projects: {
        id: "relation",
        name: "Projects",
        description: null,
        type: "relation",
        relation: {
          database_id: id(100),
          data_source_id: id(2),
          type: "dual_property",
          dual_property: {
            synced_property_id: "related",
            synced_property_name: "Source",
          },
        },
      },
    },
  } as DataSourceObjectResponse;
}
export function database(sources = [1, 2]): DatabaseObjectResponse {
  return {
    object: "database",
    id: id(99),
    title: rich("حاوية تجريبية"),
    description: [],
    parent: { type: "page_id", page_id: id(88) },
    is_inline: false,
    database_type: null,
    in_trash: false,
    archived: false,
    is_locked: false,
    created_time: "2026-10-11T10:00:00Z",
    last_edited_time: "2026-10-11T11:00:00Z",
    data_sources: sources.map((n) => ({ id: id(n), name: "مصدر" })),
    icon: null,
    cover: null,
    url: "https://notion.so/" + id(99),
    public_url: null,
  } as DatabaseObjectResponse;
}
export function page(): PageObjectResponse {
  return {
    object: "page",
    id: id(10),
    parent: { type: "page_id", page_id: id(88) },
    is_archived: false,
    is_locked: false,
    properties: {
      Name: { id: "title", type: "title", title: rich("صفحة تجريبية") },
      Secret: {
        id: "secret",
        type: "rich_text",
        rich_text: rich("SENSITIVE_VALUE_MUST_NOT_LEAVE_SEARCH"),
      },
    },
    in_trash: false,
    archived: false,
    created_time: "2026-10-11T10:00:00Z",
    last_edited_time: "2026-10-11T11:00:00Z",
    created_by: { object: "user", id: id(90) },
    last_edited_by: { object: "user", id: id(90) },
    icon: null,
    cover: null,
    url: "https://notion.so/" + id(10),
    public_url: null,
  } as PageObjectResponse;
}
export function search(
  results: SearchResponse["results"],
  cursor: string | null = null,
): SearchResponse {
  return {
    object: "list",
    type: "page_or_data_source",
    page_or_data_source: {},
    results,
    has_more: !!cursor,
    next_cursor: cursor,
  };
}
export function mockNotion(): { client: ReadOnlyNotion; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    client: {
      async search(cursor) {
        calls.push(`search:${cursor ?? "initial"}`);
        return cursor
          ? search([source(2, "دورات إلكترونية")])
          : search([page(), source()], "next");
      },
      async retrieveSource(sourceId) {
        calls.push(`source:${sourceId}`);
        return source(
          sourceId === id(2) ? 2 : 1,
          sourceId === id(2) ? "دورات إلكترونية" : "مكتبة القراءة",
        );
      },
      async retrieveDatabase(databaseId) {
        calls.push(`database:${databaseId}`);
        return database();
      },
    },
  };
}
