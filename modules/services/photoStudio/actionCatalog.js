const plugins = Object.freeze({
    create_customer_record: 'create_customer_record',
    create_followup_reminder: 'create_followup_reminder',
    create_project_record: 'create_project_record',
    create_project_tasks: 'create_project_tasks',
    check_missing_project_fields: 'check_missing_project_fields',
    update_project_status: 'update_project_status',
    generate_client_reply_draft: 'generate_client_reply_draft',
    archive_project_assets: 'archive_project_assets',
    create_selection_notice: 'create_selection_notice',
    create_delivery_tasks: 'create_delivery_tasks',
    sync_to_external_sheet_or_notion: 'sync_to_external_sheet_or_notion',
    generate_weekly_project_digest: 'generate_weekly_project_digest',
    prioritize_pending_delivery_actions: 'prioritize_pending_delivery_actions',
    generate_delivery_queue_schedule: 'generate_delivery_queue_schedule',
    inspect_delivery_audit_trail: 'inspect_delivery_audit_trail',
});

const selector = (method) => ({ type: 'selector', method });
const plugin = (pluginName, options = {}) => ({ type: 'plugin', plugin: pluginName, ...options });
const composite = (flow) => ({ type: 'composite', flow });
const todo = (reason) => ({ type: 'todo', reason });

const ACTIONS = {
    home: {
        get_home_dashboard: selector('getDashboard'),
        create_followup_reminder: plugin(plugins.create_followup_reminder),
    },
    dashboard: {
        get_home_dashboard: selector('getDashboard'),
    },

    project_command: {
        list_projects: selector('listProjects'),
        get_project: selector('getProject'),
        create_project: composite('createProjectWithTasks'),
        create_project_with_tasks: composite('createProjectWithTasks'),
        create_project_draft: composite('createProjectWithTasks'),
        advance_project_status: plugin(plugins.update_project_status),
        advance_status: plugin(plugins.update_project_status),
        create_project_tasks: plugin(plugins.create_project_tasks),
        create_tasks: plugin(plugins.create_project_tasks),
        check_missing_project_fields: plugin(plugins.check_missing_project_fields),
        generate_client_reply_draft: plugin(plugins.generate_client_reply_draft),
        generate_draft: plugin(plugins.generate_client_reply_draft),
    },
    project_board: {
        list_projects: selector('listProjects'),
        get_project: selector('getProject'),
        create_project: composite('createProjectWithTasks'),
        create_project_with_tasks: composite('createProjectWithTasks'),
        create_project_draft: composite('createProjectWithTasks'),
        advance_project_status: plugin(plugins.update_project_status),
        advance_status: plugin(plugins.update_project_status),
        create_project_tasks: plugin(plugins.create_project_tasks),
        create_tasks: plugin(plugins.create_project_tasks),
        check_missing_project_fields: plugin(plugins.check_missing_project_fields),
        generate_client_reply_draft: plugin(plugins.generate_client_reply_draft),
        generate_draft: plugin(plugins.generate_client_reply_draft),
    },
    projects: {
        list_projects: selector('listProjects'),
        get_project: selector('getProject'),
    },

    project_drawer: {
        get_project: selector('getProject'),
        analyze_project_risk: selector('getProject'),
        check_missing_project_fields: plugin(plugins.check_missing_project_fields),
        generate_client_reply_draft: plugin(plugins.generate_client_reply_draft),
        generate_draft: plugin(plugins.generate_client_reply_draft),
        create_project_tasks: plugin(plugins.create_project_tasks),
        create_tasks: plugin(plugins.create_project_tasks),
        advance_project_status: plugin(plugins.update_project_status),
        advance_status: plugin(plugins.update_project_status),
        archive_project_assets: plugin(plugins.archive_project_assets, {
            permission: 'L3',
            confirmRequired: true,
            confirmMessage: '归档项目素材属于高风险动作，请确认后再执行。',
        }),
        archive_project: plugin(plugins.archive_project_assets, {
            permission: 'L3',
            confirmRequired: true,
            confirmMessage: '归档项目素材属于高风险动作，请确认后再执行。',
        }),
        create_followup_reminder: plugin(plugins.create_followup_reminder),
    },

    client_leads: {
        list_leads: selector('listLeads'),
        list_quotes: selector('listQuotes'),
        create_customer: plugin(plugins.create_customer_record),
        create_lead: selector('createLead'),
        generate_client_reply_draft: plugin(plugins.generate_client_reply_draft),
        generate_draft: plugin(plugins.generate_client_reply_draft),
        create_followup_reminder: plugin(plugins.create_followup_reminder),
        convert_lead_to_project: composite('createProjectWithTasks'),
        create_quote: selector('createQuote'),
    },
    inquiry: {
        list_leads: selector('listLeads'),
        list_quotes: selector('listQuotes'),
        create_customer: plugin(plugins.create_customer_record),
        create_lead: selector('createLead'),
        generate_client_reply_draft: plugin(plugins.generate_client_reply_draft),
        generate_draft: plugin(plugins.generate_client_reply_draft),
        create_followup_reminder: plugin(plugins.create_followup_reminder),
        create_quote: selector('createQuote'),
    },

    schedule_board: {
        list_bookings: selector('listBookings'),
        create_booking: selector('createBooking'),
        update_booking_time: selector('updateBookingTime'),
        check_schedule_conflicts: selector('checkScheduleConflicts'),
        start_booking: selector('startBooking'),
        complete_booking: selector('completeBooking'),
    },

    delivery_assets: {
        list_delivery_packages: selector('listDeliveryPackages'),
        get_delivery_package: selector('getDeliveryPackage'),
        create_selection_notice: plugin(plugins.create_selection_notice),
        create_delivery_tasks: plugin(plugins.create_delivery_tasks),
        create_delivery_package: selector('createDeliveryPackage'),
        update_delivery_package_status: selector('updateDeliveryPackageStatus'),
        sync_external: plugin(plugins.sync_to_external_sheet_or_notion, {
            permission: 'L3',
            confirmRequired: true,
            confirmMessage: '外部同步属于高风险动作，请确认目标和范围后再执行。',
        }),
        archive_project_assets: plugin(plugins.archive_project_assets, {
            permission: 'L3',
            confirmRequired: true,
            confirmMessage: '归档项目素材属于高风险动作，请确认后再执行。',
        }),
        archive_project: plugin(plugins.archive_project_assets, {
            permission: 'L3',
            confirmRequired: true,
            confirmMessage: '归档项目素材属于高风险动作，请确认后再执行。',
        }),
        generate_delivery_queue_schedule: plugin(plugins.generate_delivery_queue_schedule),
        prioritize_pending_delivery_actions: plugin(plugins.prioritize_pending_delivery_actions),
        inspect_delivery_audit_trail: plugin(plugins.inspect_delivery_audit_trail),
    },
    delivery_panel: {
        list_delivery_packages: selector('listDeliveryPackages'),
        get_delivery_package: selector('getDeliveryPackage'),
        create_selection_notice: plugin(plugins.create_selection_notice),
        create_delivery_tasks: plugin(plugins.create_delivery_tasks),
        create_delivery_package: selector('createDeliveryPackage'),
        update_delivery_package_status: selector('updateDeliveryPackageStatus'),
        sync_external: plugin(plugins.sync_to_external_sheet_or_notion, {
            permission: 'L3',
            confirmRequired: true,
            confirmMessage: '外部同步属于高风险动作，请确认目标和范围后再执行。',
        }),
        archive_project_assets: plugin(plugins.archive_project_assets, {
            permission: 'L3',
            confirmRequired: true,
            confirmMessage: '归档项目素材属于高风险动作，请确认后再执行。',
        }),
        archive_project: plugin(plugins.archive_project_assets, {
            permission: 'L3',
            confirmRequired: true,
            confirmMessage: '归档项目素材属于高风险动作，请确认后再执行。',
        }),
        generate_delivery_queue_schedule: plugin(plugins.generate_delivery_queue_schedule),
        prioritize_pending_delivery_actions: plugin(plugins.prioritize_pending_delivery_actions),
        inspect_delivery_audit_trail: plugin(plugins.inspect_delivery_audit_trail),
    },
    delivery: {
        list_delivery_packages: selector('listDeliveryPackages'),
        create_selection_notice: plugin(plugins.create_selection_notice),
        create_delivery_tasks: plugin(plugins.create_delivery_tasks),
        create_delivery_package: selector('createDeliveryPackage'),
        update_delivery_package_status: selector('updateDeliveryPackageStatus'),
        archive_project: plugin(plugins.archive_project_assets, {
            permission: 'L3',
            confirmRequired: true,
            confirmMessage: '归档项目素材属于高风险动作，请确认后再执行。',
        }),
    },
};

module.exports = Object.freeze({
    plugins,
    actions: Object.freeze(ACTIONS),
});
