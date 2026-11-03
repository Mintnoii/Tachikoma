import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fetchAllCollectFolders,
  fetchAllCollectAwemes,
  type BrowserBridge,
  type DouyinCollectionFolder,
  type DouyinAwemeItem,
} from "@tachikoma/douyin-sync";

describe("全量游标分页器 fetchAllCollectFolders & fetchAllCollectAwemes", () => {
  it("fetchAllCollectFolders 自动根据 hasMore 循环聚合多页", async () => {
    let callCount = 0;
    const mockBridge: BrowserBridge = {
      ensurePage: async () => ({} as any),
      close: async () => {},
      requestJson: async <T = any>(path: string, params?: Record<string, unknown>): Promise<T> => {
        callCount++;
        const cursor = Number(params?.cursor ?? 0);
        if (cursor === 0) {
          return {
            status_code: 0,
            has_more: 1,
            cursor: 10,
            collects_list: [
              { collects_id_str: "101", collects_name: "第1页-夹1", total_number: 5 },
              { collects_id_str: "102", collects_name: "第1页-夹2", total_number: 8 },
            ],
          } as T;
        } else if (cursor === 10) {
          return {
            status_code: 0,
            has_more: 0,
            cursor: 20,
            collects_list: [
              { collects_id_str: "103", collects_name: "第2页-夹3", total_number: 12 },
            ],
          } as T;
        }
        return { status_code: 0, has_more: 0, cursor: 0, collects_list: [] } as T;
      },
    };

    const folders = await fetchAllCollectFolders(mockBridge, 10, 5);
    assert.equal(callCount, 2);
    assert.equal(folders.length, 3);
    assert.deepEqual(
      folders.map((f) => f.name),
      ["第1页-夹1", "第1页-夹2", "第2页-夹3"]
    );
  });

  it("fetchAllCollectAwemes 支持跨页拉取并在达到 maxCount 时截断", async () => {
    let callCount = 0;
    const mockBridge: BrowserBridge = {
      ensurePage: async () => ({} as any),
      close: async () => {},
      requestJson: async <T = any>(_path: string, params?: Record<string, unknown>): Promise<T> => {
        callCount++;
        const cursor = Number(params?.cursor ?? 0);
        return {
          status_code: 0,
          has_more: 1,
          cursor: cursor + 5,
          aweme_list: [
            { aweme_id: `aweme_${cursor}_1`, desc: `作品_${cursor}_1` },
            { aweme_id: `aweme_${cursor}_2`, desc: `作品_${cursor}_2` },
          ],
        } as T;
      },
    };

    // 限制只取 3 条
    const items = await fetchAllCollectAwemes(mockBridge, "folder_1", 3, 5, 10);
    assert.equal(items.length, 3);
    assert.equal(items[0].id, "aweme_0_1");
    assert.equal(items[1].id, "aweme_0_2");
    assert.equal(items[2].id, "aweme_5_1");
  });
});
