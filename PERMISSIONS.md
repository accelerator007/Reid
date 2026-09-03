# Permissions
Roles are additive: Owner, Super Admin, Admin, HR, Sales, Employee, Project Member, Research Member, Guest. Owner alone approves L4. HR approves hiring L3. Sales accesses CRM. External members see only assigned projects/research. Signed file access is checked at file level.

Account lifecycle changes are restricted to active Owner/Super Admin callers through `manage-account`. The current user cannot suspend or change their own roles, and Owner accounts are protected from suspension/removal through this workflow. Direct client writes to account controls and roles are not permitted.
