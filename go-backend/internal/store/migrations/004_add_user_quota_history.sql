-- 用户流量历史表（用于计费和审计）
CREATE TABLE IF NOT EXISTS user_quota_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL COMMENT '用户 ID',
    period_type VARCHAR(10) NOT NULL COMMENT '周期类型：daily/monthly',
    period_key BIGINT NOT NULL COMMENT '周期标识：YYYYMMDD 或 YYYYMM',
    used_bytes BIGINT NOT NULL DEFAULT 0 COMMENT '已用字节数（重置前）',
    reset_time BIGINT NOT NULL COMMENT '重置时间戳（毫秒）',
    created_time BIGINT NOT NULL COMMENT '创建时间戳（毫秒）',
    INDEX idx_user_period (user_id, period_type, period_key),
    INDEX idx_created_time (created_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户流量历史记录表';
