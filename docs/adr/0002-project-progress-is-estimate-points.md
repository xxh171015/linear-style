# Project and milestone progress use estimate points, not issue counts

The local replica computes Project progress as `(completed + 0.25 × started) / live scope`, excluding canceled Issues. This is a local compatibility formula; the original hosted calculation has not been verified by runtime evidence. The replica uses it, counts an unestimated Issue as 1 point, and applies the same rule to a Milestone’s Issues. We skip Linear’s hosted 99% / completed-empty display overlays. Current `milestoneStats` (completed count / live count) is not the spec.
