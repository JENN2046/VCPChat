module.exports = Object.freeze({
    plugins: {
        create_customer_record: 'create_customer_record',
        create_project_record: 'create_project_record',
        create_project_tasks: 'create_project_tasks',
        update_project_status: 'update_project_status',
        generate_client_reply_draft: 'generate_client_reply_draft',
        archive_project_assets: 'archive_project_assets',
        create_selection_notice: 'create_selection_notice',
        create_delivery_tasks: 'create_delivery_tasks',
        generate_weekly_project_digest: 'generate_weekly_project_digest',
        prioritize_pending_delivery_actions: 'prioritize_pending_delivery_actions',
        generate_delivery_queue_schedule: 'generate_delivery_queue_schedule',
    },
    actions: {
        inquiry: {
            create_customer: { type: 'plugin', plugin: 'create_customer_record' },
            generate_draft: { type: 'plugin', plugin: 'generate_client_reply_draft' },
        },
        project_board: {
            create_project_with_tasks: { type: 'composite', flow: 'createProjectWithTasks' },
            create_project_draft: { type: 'composite', flow: 'createProjectWithTasks' },
            advance_status: { type: 'plugin', plugin: 'update_project_status' },
        },
        project_drawer: {
            generate_draft: { type: 'plugin', plugin: 'generate_client_reply_draft' },
            create_tasks: { type: 'plugin', plugin: 'create_project_tasks' },
            advance_status: { type: 'plugin', plugin: 'update_project_status' },
            archive_project: { type: 'plugin', plugin: 'archive_project_assets' },
        },
        delivery_panel: {
            create_selection_notice: { type: 'plugin', plugin: 'create_selection_notice' },
            create_delivery_tasks: { type: 'plugin', plugin: 'create_delivery_tasks' },
            archive_project: { type: 'plugin', plugin: 'archive_project_assets' },
        },
    },
});
