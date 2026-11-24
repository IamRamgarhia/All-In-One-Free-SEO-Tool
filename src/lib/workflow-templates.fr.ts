/**
 * The automation templates in French, keyed by template id
 * (workflow-templates.ts). Shown when the interface is French, and used
 * for the automation's name, task title and log line when the workspace
 * language is French at install time.
 */
export type WorkflowTemplateFr = {
  name: string;
  description: string;
  /** Title of the task the automation creates (create_task only). */
  title?: string;
  /** Line written to the activity log (log only). */
  message?: string;
};

export const WORKFLOW_TEMPLATES_FR: Record<string, WorkflowTemplateFr> = {
  "rank-drop-slack": {
    name: "Chute de position → alerte Slack",
    description:
      "Quand un mot-clé suivi perd des positions, un message est publié dans le canal Slack de votre équipe pour que vous puissiez enquêter avant que le client ne le remarque.",
  },
  "rank-drop-task": {
    name: "Chute de position → tâche d’analyse",
    description:
      "Crée une tâche de priorité haute quand un mot-clé recule dans le classement, pour traiter la perte tant qu’elle est encore rattrapable.",
    title: "Analyser la chute de position",
  },
  "page-change-slack": {
    name: "Modification de page → alerte Slack",
    description:
      "Le title, la meta description, le H1 ou l’URL canonique d’une page suivie a changé, souvent à la suite d’une modification que vous n’aviez pas validée. Le détail des changements arrive dans Slack.",
  },
  "score-drop-task": {
    name: "Baisse du score d’audit → tâche de correction",
    description:
      "Le score d’audit recule par rapport à l’analyse précédente. Une tâche est créée pour comprendre ce qui a changé avant que cela ne s’aggrave.",
    title: "Le score d’audit a baissé : chercher la cause",
  },
  "audit-completed-log": {
    name: "Audit terminé → journal d’activité",
    description:
      "Inscrit chaque audit réussi dans le journal d’activité, pour que les rapports mensuels remplissent d’eux-mêmes la partie « travail réalisé ».",
    message: "Audit terminé : résultats prêts à être consultés",
  },
  "audit-failed-slack": {
    name: "Échec d’audit → alerte Slack",
    description:
      "L’audit a échoué (site hors ligne, blocage par robots.txt, délai dépassé). Vous êtes prévenu tout de suite au lieu de le découvrir au rapport mensuel suivant.",
  },
  "page-change-task": {
    name: "Modification de page → tâche de vérification",
    description:
      "Crée une tâche de priorité moyenne pour vérifier les modifications de title ou de meta description non validées sur les pages suivies.",
    title: "Vérifier une modification de page non validée",
  },
  "score-drop-slack": {
    name: "Baisse du score d’audit → Slack",
    description:
      "Une baisse de score sur n’importe quel client est signalée dans Slack : pratique pour suivre plusieurs sites à la fois.",
  },
};
