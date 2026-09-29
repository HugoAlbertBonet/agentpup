import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("pet settings view", () => {
  it("keeps design management out of the agent activity view", async () => {
    const html = await readFile(new URL("../renderer/index.html", import.meta.url), "utf8");
    const activity = section(html, "activity-view");
    const settings = section(html, "settings-view");

    expect(activity).toContain('id="agent-list"');
    expect(activity).toContain('id="agent-clear"');
    expect(activity).toContain("Clear inactive");
    expect(activity).not.toContain('id="pet-import"');
    expect(settings).toContain('id="pet-enabled"');
    expect(settings).toContain('id="pet-size"');
    expect(settings).toContain('id="pet-animations"');
    expect(settings).toContain('id="startup-enabled"');
    expect(settings).toContain('id="startup-label"');
    expect(settings).toContain('id="pet-cycle"');
    expect(settings).toContain('id="pet-gallery"');
    expect(settings).toContain('id="pet-import"');
    expect(settings).toContain('id="pet-animation-preview"');
    expect(settings).toContain('data-preview-state="idle"');
    expect(settings).toContain('data-preview-state="working"');
    expect(settings).toContain('data-preview-state="needs-you"');
    expect(settings).not.toContain('data-preview-state="ready"');
    expect(settings).toContain('id="status-size"');
    expect(settings).toContain('id="status-font-size"');
    expect(settings).toContain('id="status-line-gap"');
    expect(settings).toContain('id="diagnostics-open"');
    expect(settings).toContain('id="integrations-open"');

    const diagnostics = section(html, "diagnostics-view");
    expect(diagnostics).toContain('id="diagnostics-back"');
    expect(diagnostics).toContain('id="diagnostics-collector"');
    expect(diagnostics).toContain('id="diagnostics-last-snapshot"');
    expect(diagnostics).toContain('id="diagnostics-codex"');
    expect(diagnostics).toContain('id="diagnostics-claude"');
    expect(diagnostics).toContain('id="diagnostics-last-event"');
    expect(diagnostics).toContain('id="diagnostics-copy"');

    const integrations = section(html, "integrations-view");
    expect(integrations).toContain('id="integrations-back"');
    expect(integrations).toContain('id="integration-environment"');
    expect(integrations).toContain('id="integration-codex"');
    expect(integrations).toContain('id="integration-claude"');
    expect(integrations).toContain('id="integration-install"');
    expect(integrations).toContain('id="integration-uninstall"');
    expect(integrations).toContain('id="integration-message"');
  });

  it("plays the actual sprite rows in the pet animation preview", async () => {
    const [renderer, css] = await Promise.all([
      readFile(new URL("./renderer.ts", import.meta.url), "utf8"),
      readFile(new URL("../renderer/styles.css", import.meta.url), "utf8")
    ]);

    expect(renderer).toContain('querySelectorAll<HTMLElement>("[data-preview-state]")');
    expect(renderer).toContain("resolvePetAnimation(state)");
    expect(css).toContain(".animation-preview-grid");
    expect(css).toContain(".animation-preview-frame");
  });

  it("keeps the status badge available when the character is hidden", async () => {
    const css = await readFile(new URL("../renderer/styles.css", import.meta.url), "utf8");

    expect(css).toMatch(/\[data-pet-enabled="false"\]\s+\.pet-toggle\s*\{[^}]*display:\s*none/s);
    expect(css).not.toMatch(/\[data-pet-enabled="false"\]\s+\.badge/);
    expect(css).toMatch(/\[data-animations-enabled="false"\]\s+\.pet-sprite\s*\{[^}]*animation:\s*none\s*!important/s);
  });

  it("allows long settings and diagnostics content to scroll inside the panel", async () => {
    const css = await readFile(new URL("../renderer/styles.css", import.meta.url), "utf8");

    expect(css).toMatch(
      /\.settings-view,\s*\.diagnostics-view,\s*\.integrations-view\s*\{[^}]*max-height:\s*350px[^}]*overflow-y:\s*auto/s
    );
    expect(css).toMatch(
      /\.settings-view,\s*\.diagnostics-view,\s*\.integrations-view\s*\{[^}]*overscroll-behavior:\s*contain/s
    );
  });

  it("uses a vertical three-state status control with corner rotation below it", async () => {
    const [html, css] = await Promise.all([
      readFile(new URL("../renderer/index.html", import.meta.url), "utf8"),
      readFile(new URL("../renderer/styles.css", import.meta.url), "utf8")
    ]);
    const controls = element(html, "status-controls", "div");

    expect(controls).toContain('id="working-metric"');
    expect(controls).toContain('id="needs-metric"');
    expect(controls).toContain('id="ready-metric"');
    expect(controls).not.toContain("coverage-indicator");
    expect(controls.indexOf('id="corner-move"')).toBeGreaterThan(
      controls.indexOf('id="status-toggle"')
    );
    expect(css).toMatch(/\.status-controls\s*\{[^}]*flex-direction:\s*column/s);
    expect(css).toMatch(/\.metrics\s*\{[^}]*flex-direction:\s*column/s);
    expect(css).toMatch(/\.status-controls\s*\{[^}]*right:\s*6px/s);
    expect(css).toMatch(/\.pet-toggle\s*\{[^}]*right:\s*calc\(var\(--status-control-width\)\s*\+\s*18px\)/s);
    expect(css).toMatch(/\[data-corner\$="left"\]\s+\.status-controls\s*\{[^}]*left:\s*6px/s);
    expect(css).toMatch(
      /\[data-corner\$="left"\]\s+\.pet-toggle\s*\{[^}]*left:\s*calc\(var\(--status-control-width\)\s*\+\s*18px\)/s
    );
  });
});

function section(html: string, id: string): string {
  const start = html.indexOf(`id="${id}"`);
  if (start < 0) throw new Error(`Missing #${id}`);
  const end = html.indexOf("</section>", start);
  if (end < 0) throw new Error(`Unclosed #${id}`);
  return html.slice(start, end);
}

function element(html: string, id: string, tag: string): string {
  const start = html.indexOf(`id="${id}"`);
  if (start < 0) throw new Error(`Missing #${id}`);
  const end = html.indexOf(`</${tag}>`, start);
  if (end < 0) throw new Error(`Unclosed #${id}`);
  return html.slice(start, end);
}
