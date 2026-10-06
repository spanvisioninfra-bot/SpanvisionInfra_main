import { Group, Panel, Separator } from "react-resizable-panels";
import { useEffect, useState } from "react";
import "./SplitPane.css";

export default function SplitPane({
  left,
  right,
  leftLabel = "Input",
  rightLabel = "Results",
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  leftLabel?: string;
  rightLabel?: string;
}) {
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 900px)").matches);
  const [phone, setPhone] = useState(() => window.matchMedia("(max-width: 600px)").matches);
  const [activePane, setActivePane] = useState<"left" | "right">("left");
  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => {
      setCompact(media.matches);
      setPhone(window.matchMedia("(max-width: 600px)").matches);
    };
    const phoneMedia = window.matchMedia("(max-width: 600px)");
    media.addEventListener("change", update);
    phoneMedia.addEventListener("change", update);
    return () => {
      media.removeEventListener("change", update);
      phoneMedia.removeEventListener("change", update);
    };
  }, []);
  if (phone) return (
    <div className="compact-workspace">
      <div className="compact-pane-tabs" role="tablist" aria-label="Workspace pane">
        <button role="tab" aria-selected={activePane === "left"} onClick={() => setActivePane("left")}>{leftLabel}</button>
        <button role="tab" aria-selected={activePane === "right"} onClick={() => setActivePane("right")}>{rightLabel}</button>
      </div>
      <div className="compact-pane" role="tabpanel" aria-label={activePane === "left" ? leftLabel : rightLabel}>
        {activePane === "left" ? left : right}
      </div>
    </div>
  );
  return (
    <Group orientation={compact ? "vertical" : "horizontal"} className="split-pane">
      <Panel defaultSize={50} minSize={20}>
        {left}
      </Panel>
      <Separator className="split-pane-handle" />
      <Panel defaultSize={50} minSize={20}>
        {right}
      </Panel>
    </Group>
  );
}
