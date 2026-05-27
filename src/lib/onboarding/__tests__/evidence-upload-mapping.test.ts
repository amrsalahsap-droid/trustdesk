import { describe, expect, it } from "vitest";
import {
  RECOMMENDATION_ID_TO_TYPE_HINT,
  resolveUploadTypeHint,
} from "../evidence-upload-mapping";

describe("evidence-upload-mapping", () => {
  it("maps INFSEC recommendation id to security_policy orchestration hint", () => {
    expect(RECOMMENDATION_ID_TO_TYPE_HINT.upload_infosec_policy).toBe("security_policy");
    expect(resolveUploadTypeHint("upload_infosec_policy")).toBe("security_policy");
  });

  it("resolves human-readable titles to hints", () => {
    expect(resolveUploadTypeHint("Information Security Policy")).toBe("security_policy");
    expect(resolveUploadTypeHint("SOC 2 Report")).toBe("soc2_report");
  });
});
