enum Permission { VIEW_ANSWERS = "VIEW_ANSWERS" }
const perms: Permission[] = [Permission.VIEW_ANSWERS];
const test = perms.includes("VIEW_ANSWERS");
