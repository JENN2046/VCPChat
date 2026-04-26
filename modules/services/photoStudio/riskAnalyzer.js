function analyzeProjectRisk(project) {
    const missing = [];
    const reasons = [];

    if (!project.delivery_deadline && !project.due_date) {
        missing.push('delivery_deadline');
    }

    if (!project.shoot_date && !project.start_date) {
        missing.push('shoot_date');
    }

    if (missing.length > 0) {
        reasons.push(...missing.map((field) => `missing:${field}`));
    }

    if (project.current_blocker) {
        reasons.push(`blocker:${project.current_blocker}`);
    }

    if (project.status === 'delivering') {
        reasons.push('delivery:active');
    }

    let level = 'low';
    if (missing.length > 0 || project.current_blocker) {
        level = 'medium';
    }
    if (project.status === 'delivering' && (missing.length > 0 || project.current_blocker)) {
        level = 'high';
    }

    return {
        level,
        reasons,
        missing,
    };
}

module.exports = {
    analyzeProjectRisk,
};
