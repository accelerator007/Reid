# Permissions
Roles are additive: Owner, Super Admin, Admin, HR, Sales, Employee, Project Member, Research Member, Guest. Owner alone approves L4. HR approves hiring L3. Sales accesses CRM. External members see only assigned projects/research. Signed file access is checked at file level.

Account lifecycle changes are restricted to active Owner/Super Admin callers through `manage-account`. The current user cannot suspend or change their own roles, and Owner accounts are protected from suspension/removal through this workflow. Direct client writes to account controls and roles are not permitted.

Active company users can read the employee directory and departments. Employees can complete their own onboarding items, update assigned task state, create their own private calendar entries, upload/read their own documents, and record their own timesheets. They can read only their own KPIs and performance reviews. Owner, Super Admin, Admin, and HR can manage employee records, onboarding, task assignment, company calendar entries, announcements, documents, KPIs, and reviews. Storage policies repeat the employee/HR/Admin ownership boundary at the object layer.
