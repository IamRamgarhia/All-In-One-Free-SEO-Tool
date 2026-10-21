"use client";

import { useOptimistic, useTransition } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
  type DroppableProvided,
  type DroppableStateSnapshot,
  type DraggableProvided,
  type DraggableStateSnapshot,
} from "@hello-pangea/dnd";
import { useTranslations } from "next-intl";
import { Clock, Sparkles, Check } from "lucide-react";
import { KanbanCard, type TaskRowData } from "./task-row";
import { setTaskStatus } from "./actions";

type Status = "todo" | "in_progress" | "done" | "skipped";

const statusOrder: Status[] = ["todo", "in_progress", "done", "skipped"];

const statusMeta: Record<
  Status,
  { icon: typeof Clock; iconText: string; iconBg: string }
> = {
  todo: {
    icon: Clock,
    iconText: "text-muted-foreground",
    iconBg: "bg-white/5 ring-white/10",
  },
  in_progress: {
    icon: Sparkles,
    iconText: "text-violet-300",
    iconBg: "bg-violet-500/15 ring-violet-400/30",
  },
  done: {
    icon: Check,
    iconText: "text-emerald-300",
    iconBg: "bg-emerald-500/15 ring-emerald-400/30",
  },
  skipped: {
    icon: Check,
    iconText: "text-muted-foreground",
    iconBg: "bg-white/5 ring-white/10",
  },
};

export function KanbanBoard({
  initialTasks,
  nowMs,
}: {
  initialTasks: TaskRowData[];
  nowMs: number;
}) {
  const t = useTranslations("tasks");
  const [optimistic, applyOptimistic] = useOptimistic(
    initialTasks,
    (current: TaskRowData[], update: { id: number; status: Status }) =>
      current.map((t) =>
        t.id === update.id ? { ...t, status: update.status } : t,
      ),
  );
  const [, startTransition] = useTransition();

  function onDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }
    const taskId = Number(draggableId);
    const newStatus = destination.droppableId as Status;
    if (!statusOrder.includes(newStatus)) return;

    startTransition(async () => {
      applyOptimistic({ id: taskId, status: newStatus });
      await setTaskStatus(taskId, newStatus);
    });
  }

  const byStatus: Record<Status, TaskRowData[]> = {
    todo: optimistic.filter((t) => t.status === "todo"),
    in_progress: optimistic.filter((t) => t.status === "in_progress"),
    done: optimistic.filter((t) => t.status === "done"),
    skipped: optimistic.filter((t) => t.status === "skipped"),
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="grid gap-4 lg:grid-cols-4">
        {statusOrder.map((s) => {
          const list = byStatus[s];
          const meta = statusMeta[s];
          const Icon = meta.icon;
          return (
            <div
              key={s}
              className="rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md"
            >
              <header className="flex items-center justify-between border-b border-white/5 px-4 py-3">
                <div className="flex items-center gap-2">
                  <div
                    className={`flex size-7 items-center justify-center rounded-lg ring-1 ${meta.iconBg}`}
                  >
                    <Icon className={`size-3.5 ${meta.iconText}`} />
                  </div>
                  <span className="text-sm font-semibold">
                    {t(`status.${s}`)}
                  </span>
                </div>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-white/10">
                  {list.length}
                </span>
              </header>
              <Droppable droppableId={s}>
                {(provided: DroppableProvided, snapshot: DroppableStateSnapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`min-h-[120px] space-y-2 p-3 transition-colors ${
                      snapshot.isDraggingOver
                        ? "bg-violet-500/[0.04]"
                        : ""
                    }`}
                  >
                    {list.length === 0 && !snapshot.isDraggingOver ? (
                      <div className="rounded-lg border border-dashed border-white/5 px-3 py-6 text-center text-xs text-muted-foreground">
                        {t("dropHere")}
                      </div>
                    ) : (
                      list.map((task, i) => (
                        <Draggable
                          key={task.id}
                          draggableId={String(task.id)}
                          index={i}
                        >
                          {(dp: DraggableProvided, snap: DraggableStateSnapshot) => (
                            <div
                              ref={dp.innerRef}
                              {...dp.draggableProps}
                              {...dp.dragHandleProps}
                              style={dp.draggableProps.style}
                              className={
                                snap.isDragging
                                  ? "rotate-1 ring-2 ring-violet-400/50 rounded-xl"
                                  : ""
                              }
                            >
                              <KanbanCard task={task} nowMs={nowMs} />
                            </div>
                          )}
                        </Draggable>
                      ))
                    )}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
