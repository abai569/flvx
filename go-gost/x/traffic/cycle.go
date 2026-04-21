package traffic

import (
	"time"
)

// CalculateNextReset 根据续费周期计算下次重置时间
// 返回零值 time.Time{} 表示不自动重置
func CalculateNextReset(renewalCycle string, from time.Time) time.Time {
	loc := from.Location()

	switch renewalCycle {
	case "daily":
		// 明天 00:00
		return time.Date(from.Year(), from.Month(), from.Day()+1, 0, 0, 0, 0, loc)

	case "weekly":
		// 下周一 00:00
		daysUntilMonday := (8 - int(from.Weekday())) % 7
		if daysUntilMonday == 0 {
			daysUntilMonday = 7
		}
		return time.Date(from.Year(), from.Month(), from.Day()+daysUntilMonday, 0, 0, 0, 0, loc)

	case "monthly":
		// 下月1日 00:00
		return time.Date(from.Year(), from.Month()+1, 1, 0, 0, 0, 0, loc)

	case "quarterly":
		// 下季度首日
		currentQuarter := (int(from.Month()) - 1) / 3
		nextQuarterMonth := time.Month(currentQuarter*3 + 4)
		return time.Date(from.Year(), nextQuarterMonth, 1, 0, 0, 0, 0, loc)

	case "yearly":
		// 明年1月1日
		return time.Date(from.Year()+1, 1, 1, 0, 0, 0, 0, loc)

	default:
		// once 或其他值：不自动重置
		return time.Time{}
	}
}

// IsAutoResetEnabled 检查是否启用自动重置
func IsAutoResetEnabled(renewalCycle string) bool {
	switch renewalCycle {
	case "daily", "weekly", "monthly", "quarterly", "yearly":
		return true
	default:
		return false
	}
}
