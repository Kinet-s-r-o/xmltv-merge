package auth

// Section is an application area that a role grants permissions on.
type Section string

const (
	SectionDashboard Section = "dashboard"
	SectionEPG       Section = "epg"
	SectionChannels  Section = "channels"
	SectionSources   Section = "sources"
	SectionOutputs   Section = "outputs"
	SectionMulticast Section = "multicast"
	SectionUsers     Section = "users"
	SectionRoles     Section = "roles"
	SectionRadius    Section = "radius"
)

// Sections lists every section in display order. Migration 009 seeds the
// built-in Administrator role with the same list.
var Sections = []Section{
	SectionDashboard, SectionEPG, SectionChannels, SectionSources, SectionOutputs,
	SectionMulticast, SectionUsers, SectionRoles, SectionRadius,
}

// ValidSection reports whether s is a known section.
func ValidSection(s Section) bool {
	for _, v := range Sections {
		if v == s {
			return true
		}
	}
	return false
}

// Action is one permission a role can grant on a section.
type Action string

const (
	ActionRead   Action = "read"
	ActionEdit   Action = "edit"
	ActionDelete Action = "delete"
	ActionImport Action = "import"
	ActionExport Action = "export"
)

// Permission is the set of actions granted on one section.
type Permission struct {
	Full   bool `json:"full"`
	Read   bool `json:"read"`
	Edit   bool `json:"edit"`
	Delete bool `json:"delete"`
	Import bool `json:"import"`
	Export bool `json:"export"`
}

// Normalize makes Full imply every action and any action imply Read.
func (p Permission) Normalize() Permission {
	if p.Full {
		return Permission{Full: true, Read: true, Edit: true, Delete: true, Import: true, Export: true}
	}
	if p.Edit || p.Delete || p.Import || p.Export {
		p.Read = true
	}
	if p.Read && p.Edit && p.Delete && p.Import && p.Export {
		p.Full = true
	}
	return p
}

// Allows reports whether the permission grants action.
func (p Permission) Allows(a Action) bool {
	if p.Full {
		return true
	}
	switch a {
	case ActionRead:
		return p.Read
	case ActionEdit:
		return p.Edit
	case ActionDelete:
		return p.Delete
	case ActionImport:
		return p.Import
	case ActionExport:
		return p.Export
	}
	return false
}

// Permissions maps sections to granted actions; missing sections grant nothing.
type Permissions map[Section]Permission

// Allows reports whether action is granted on section.
func (p Permissions) Allows(s Section, a Action) bool {
	return p[s].Allows(a)
}

// Complete returns a copy with an entry for every section.
func (p Permissions) Complete() Permissions {
	out := make(Permissions, len(Sections))
	for _, s := range Sections {
		out[s] = p[s].Normalize()
	}
	return out
}

// FullAccess grants every action on every section.
func FullAccess() Permissions {
	out := make(Permissions, len(Sections))
	for _, s := range Sections {
		out[s] = Permission{Full: true}.Normalize()
	}
	return out
}
