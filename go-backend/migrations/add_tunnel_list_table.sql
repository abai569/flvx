-- Tunnel List Grouping Feature
-- Creates tunnel_list and tunnel_list_tunnel tables for tunnel grouping (display only)
-- Independent from tunnel_group (permission-based grouping)

-- Table: tunnel_list (tunnel grouping for display)
CREATE TABLE IF NOT EXISTS `tunnel_list` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `inx` int DEFAULT 0,
  `status` int NOT NULL DEFAULT 1,
  `created_time` bigint NOT NULL,
  `updated_time` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_tunnel_list_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: tunnel_list_tunnel (tunnel-group association)
CREATE TABLE IF NOT EXISTS `tunnel_list_tunnel` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tunnel_list_id` bigint NOT NULL,
  `tunnel_id` bigint NOT NULL,
  `inx` int DEFAULT 0,
  `created_time` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_tunnel_list_tunnel_unique` (`tunnel_list_id`, `tunnel_id`),
  KEY `idx_tunnel_id` (`tunnel_id`),
  CONSTRAINT `fk_tunnel_list` FOREIGN KEY (`tunnel_list_id`) REFERENCES `tunnel_list` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tunnel` FOREIGN KEY (`tunnel_id`) REFERENCES `tunnel` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Note: GORM AutoMigrate will handle table creation at application startup
-- This SQL file is provided for manual migration if needed
