# Project and milestone progress use estimate points, not issue counts

Linear computes Project progress as `(completed + 0.25 × started) / live scope`, excluding canceled Issues. This replica adopts that formula, counts an unestimated Issue as 1 point, and applies the same rule to a Milestone’s Issues. We skip Linear’s hosted 99% / completed-empty display overlays. Current `milestoneStats` (completed count / live count) is not the spec.
