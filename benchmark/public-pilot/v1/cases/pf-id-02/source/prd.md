# M.O.S.S. (Material Organization & Storage System)

## Executive Summary

A comprehensive IT asset management and documentation platform built as an open-source replacement for IT Glue, designed specifically for hardware and application inventory, network documentation, and infrastructure mapping. The system enables complete tracking of physical infrastructure, network topology, software deployments, SaaS services, and their interconnections.

It's named for Maurice Moss of The IT Crowd.

**Target User**: IT departments at mid-size companies with complex infrastructure including traditional IT equipment, broadcast/AV equipment, and modern cloud services.

**Core Value Proposition**: Single source of truth for all IT assets, relationships, and documentation with powerful network mapping capabilities and role-based access control.

---

## Project Goals

### Primary Objectives
1. **Comprehensive Asset Tracking**: Track all IT infrastructure from data center equipment to broadcast studio gear to SaaS applications
2. **Network Topology Mapping**: Generate detailed network maps based on physical and logical interface relationships
3. **Relationship Management**: Maintain complex relationships between devices, people, software, networks, and locations
4. **Documentation Hub**: Centralize all IT documentation with proper relationships to relevant assets
5. **Access Control**: Implement granular role-based permissions at object and field levels

### Success Criteria
- Complete inventory of all devices, software, and services across organization
- Ability to generate accurate network topology diagrams from relationship data
- Sub-second search and retrieval across all object types
- Support for modular/chassis-based equipment with independent warranty/lifecycle tracking
- Comprehensive power topology tracking for redundancy planning
- Integration points established for future automated sync modules

---

## User Personas

### Primary Users

**IT Director/CTO**
- Needs: High-level visibility, compliance reporting, budget planning
- Use cases: License auditing, contract renewals, infrastructure planning, vendor management

**Network Engineer**
- Needs: Detailed network topology, interface configurations, VLAN mapping
- Use cases: Network troubleshooting, capacity planning, topology documentation, VLAN auditing

**Systems Administrator**
- Needs: Server inventory, software deployments, user-device relationships
- Use cases: Device provisioning, software license tracking, warranty management, hardware lifecycle

**Help Desk Technician**
- Needs: User-device assignments, application access, contact information
- Use cases: User support, device lookup, application access verification

**Broadcast/AV Engineer**
- Needs: Signal flow documentation, non-network connectivity, equipment specifications
- Use cases: Studio equipment tracking, SDI/HDMI routing, patch panel documentation

---

## Core Features

### 1. Asset Management

**Devices**
- Support for all device types: servers, switches, routers, computers, mobile devices, broadcast equipment, UPS/PDU
- Parent-child relationships for modular equipment (chassis with line cards, blade servers)
- Independent warranty, serial number, and install date tracking per module
- Assignment to people, locations, and rooms
- Status tracking (active, retired, repair, storage)

**People & Companies**
- Unified person object for employees, contractors, and vendor contacts
- Company types: own organization, vendors, manufacturers, partners
- Person-to-company associations with role context
- Manager relationships and organizational hierarchy

**Locations & Rooms**
- Multi-level physical organization: Location → Room → Device
- Room types: offices, conference rooms, server rooms, studios, control rooms
- Access requirement tracking per room
- Network drop and patch panel port mapping to specific rooms

### 2. Network Infrastructure

**Networks & VLANs**
- Network definition with CIDR, VLAN ID, gateway, DNS
- Network types: LAN, WAN, DMZ, guest, management, storage, broadcast
- DHCP configuration tracking

**IOs (Interfaces/Ports)**
- Universal interface tracking for all connection types:
  - Network: Ethernet, fiber, WiFi
  - Broadcast: SDI, HDMI, XLR, Coax
  - Power: AC input/output, DC, PoE
  - Data: USB, Thunderbolt, DisplayPort
  - Infrastructure: Patch panel ports
- Trunk mode configuration (access, trunk, hybrid)
- Native/untagged VLAN assignment
- Tagged VLAN associations (many-to-many)
- Physical connectivity tracking (IO-to-IO relationships)
- Power topology tracking for redundancy

**IP Address Management**
- IPv4 and IPv6 support
- Type tracking: static, DHCP, reserved, floating
- DNS name association
- Network-to-IP relationships

**Topology Mapping**
- Generate L2/L3 network diagrams from interface connections
- Power topology visualization
- Broadcast signal flow documentation
- Physical rack/room layout mapping

### 3. Software & Services

**Software Catalog**
- Product-level tracking independent of deployments
- Publisher/vendor association
- Category classification

**SaaS Services**
- Service instance tracking per environment (prod, staging, dev)
- SSO configuration: provider, protocol (SAML, OIDC), SCIM status
- User and group licensing associations
- Service-to-service integrations (e.g., Slack → Jira, Notion)
- Business owner and technical contact assignment
- Subscription and billing tracking

**Installed Applications**
- Deployment tracking via MDM/GPO/package manager
- Version and update management
- Group-based deployment targeting
- Device-level installation tracking
- License association

**License Management**
- License types: perpetual, subscription, volume, concurrent
- Seat count and utilization tracking
- Expiration and renewal management
- Assignment to people, applications, and services
- Cost and billing frequency

### 4. Documentation & External References

**Internal Documentation**
- Document types: policies, procedures, runbooks, diagrams, SOPs
- Rich text/Markdown content
- Versioning and approval workflow
- Multi-object associations (devices, networks, services, locations)

**External Documents**
- Link to external systems: password vaults (1Password), ticket systems (Jira), domain registrars, wikis
- URL-based references with type classification
- Flexible associations to any object type

**Contracts**
- Vendor contracts with start/end dates
- Auto-renewal tracking with notice periods
- Association with software, services, devices
- Cost and billing frequency

### 5. Role-Based Access Control

**Roles & Permissions**
- Predefined system roles and custom role creation
- Permission granularity: view, edit, delete, manage_permissions
- Object-type specific permissions

**Role Assignments**
- Assign to individuals or groups
- Scope options: global, location-based, specific objects
- Location-based scoping for distributed teams

**Object-Level Permissions**
- Override role permissions for specific objects
- Grant/deny access at individual item level
- Support for both user and group assignments

### 6. Search & Discovery

**Global Search**
- Full-text search across all object types
- Relationship-aware search (find all devices in a location, all services using Okta)
- Filter by object type, status, date ranges

**Advanced Queries**
- Find orphaned assets (no location, no owner)
- License utilization analysis
- Warranty expiration reporting
- Contract renewal forecasting

---

## Data Model Summary

### Core Objects
- **Company**: Organizations (own, vendors, manufacturers)
- **Person**: All people (employees, contractors, contacts)
- **Location**: Physical sites
- **Room**: Spaces within locations
- **Device**: All hardware assets (including parent-child for modules)
- **IO**: Universal interface/port/connector object
- **Network**: Network segments with VLAN configuration
- **IPAddress**: IP assignments

### Software Objects
- **Software**: Product catalog
- **SaaSService**: Cloud service instances
- **InstalledApplication**: Deployed software
- **SoftwareLicense**: License tracking

### Access & Organization
- **Group**: All group types (AD, Okta, Jamf, custom)
- **Role**: RBAC roles
- **Permission**: Granular permissions
- **RoleAssignment**: Role-to-person/group mappings
- **ObjectPermission**: Object-level overrides

### Documentation
- **Document**: Internal documentation
- **ExternalDocument**: Links to external systems
- **Contract**: Vendor agreements

### Key Relationship Patterns
- Devices → parent_device (modular equipment)
- IOs → connected_to_io (physical topology)
- IOs → native_network (untagged VLAN)
- IOs → tagged_networks (trunk VLANs)
- SaaSServices → integrations (service-to-service)
- Person → company (employment/affiliation)

---

## Technical Architecture

### Technology Stack
- **Database**: PostgreSQL with UUID primary keys
- **Backend API**: REST architecture (specific framework TBD)
- **Frontend**: Modern JavaScript framework (React/Next.js preferred)
- **Hosting**: Cloudflare Pages/Workers (free tier priority)
- **Storage**: Cloudflare R2 for file uploads
- **Database**: Cloudflare D1 (PostgreSQL compatible) or hosted PostgreSQL

### Database Design Principles
- UUID primary keys for distributed system readiness
- Soft deletes via status fields where appropriate
- Junction tables for many-to-many relationships
- Audit trails: created_at, updated_at on all tables
- Foreign key constraints for referential integrity
- Indexes on frequently queried fields

### API Design
- RESTful endpoints following resource-based patterns
- Pagination for list endpoints (default 50, max 200)
- Filtering, sorting, and field selection support
- Relationship expansion via query parameters
- Batch operations for bulk updates

### Security
- JWT-based authentication
- Role-based permission evaluation at API layer
- Object-level permission checks before data access
- Audit logging for sensitive operations
- TLS/HTTPS enforcement

---

## Phase 1: Core Features (MVP)

**Scope**: Basic CRUD operations for all core objects with relationship management

**Included**:
- Complete data model implementation
- Basic UI for all object types
- Create, Read, Update, Delete operations
- Relationship management (linking objects)
- Basic search (by name, type, status)
- Simple role management (admin, read-only)
- Authentication (email/password)

**Out of Scope**:
- Advanced search/filtering
- Network topology visualization
- Automated sync modules
- Granular RBAC
- File uploads
- Bulk import/export

**Success Metrics**:
- Can track 100+ devices with relationships
- Sub-second page loads
- Zero data loss on concurrent updates

---

## Phase 2: Advanced Features

**Network Visualization**
- Interactive network topology maps
- Power topology diagrams
- Physical rack layouts
- Signal flow diagrams for broadcast

**Advanced Search & Reporting**
- Complex queries across relationships
- Saved searches/views
- Custom reports
- Export to CSV/Excel
- Dashboard with key metrics

**Enhanced RBAC**
- Granular object-level permissions
- Location-based scoping
- Audit logs for permission changes
- Permission request workflow

**Bulk Operations**
- CSV import for mass data loading
- Bulk edit across multiple objects
- Template-based creation

---

## Phase 3: Automation & Integration

**Authentication & Authorization**
- SAML 2.0 authentication with SCIM integration (Okta, Azure AD, etc.)
- Support for provisioning users and admins via SCIM
- Role synchronization from identity provider
- Group membership sync
- Automated user lifecycle management

**API & LLM Integration**
- OpenAPI-compatible REST endpoints for ChatGPT integration
- MCP (Model Context Protocol) SSE/HTTP server with OAuth2
- Support for Claude and other LLM clients
- Structured data access for AI assistants
- Context-aware API documentation

**Sync Modules** (Future Development)
- Active Directory sync (users, groups)
- MDM integration (Jamf, Intune) for device inventory
- Cloud provider APIs (AWS, Azure, GCP) for virtual infrastructure
- Network device polling (SNMP, SSH) for interface states
- Expense management integration for contract/license costs

**Automation**
- Automated warranty expiration alerts
- License renewal notifications
- Contract renewal reminders
- Scheduled reports
- Auto-discovery of new devices on network

**Advanced Integrations**
- Webhook support for external systems
- API webhooks for real-time updates
- Slack/Teams notifications
- Ticket system integration (create from asset view)

---

## Non-Functional Requirements

### Performance
- Page load time: < 2 seconds for detail views
- Search results: < 1 second for simple queries
- Support for 10,000+ devices
- Support for 50+ concurrent users
- API response time: < 500ms for standard requests

### Scalability
- Horizontal scaling for API servers
- Database read replicas for reporting
- Caching layer for frequently accessed data
- CDN for static assets

### Reliability
- 99.5% uptime target
- Automated database backups (daily)
- Point-in-time recovery capability
- Graceful degradation on dependency failures

### Security
- SOC 2 compliance readiness
- Encrypted data at rest and in transit
- Regular security audits
- Vulnerability scanning
- Penetration testing before production

### Usability
- Mobile-responsive design (iOS primary)
- Keyboard shortcuts for power users
- Contextual help/documentation
- Intuitive navigation
- Quick actions from any view

---

## Open Questions & Decisions Needed

1. **Primary hosting environment**: Cloudflare Workers or traditional server deployment?
2. **Authentication provider**: Self-hosted or delegate to Okta/Auth0?
3. **File storage**: Local uploads or external (R2, S3)?
4. **Reporting engine**: Built-in or integrate with BI tool?
5. **Mobile app**: PWA sufficient or native iOS app needed?
6. **Real-time updates**: WebSocket for live updates or polling?
7. **Backup strategy**: Database dumps only or full application snapshots?

---

## Constraints

**Budget**: Must be free or near-free for development/testing phase
**Development Resources**: Single developer (IT Director with systems architecture background, not software development)
**Timeline**: Phased approach, MVP in 3-6 months
**Hosting**: Cloudflare free tier preferred to minimize operational costs
**Maintenance**: Must be low-maintenance, minimal ongoing management required

---

## Success Metrics

### User Adoption
- 100% of IT team actively using within 6 months
- < 5 support requests per month after stabilization
- > 90% user satisfaction score

### Data Quality
- > 95% of devices have complete basic information
- > 90% of devices have location assignments
- > 80% of network interfaces have connectivity documented

### Operational Impact
- 50% reduction in time to locate device information
- 75% reduction in "who owns this?" questions
- Zero critical outages due to missing infrastructure documentation
- 100% of license renewals identified 60+ days in advance

---

## Appendix: Example Use Cases

### Use Case 1: New Employee Onboarding
1. Create Person record (employee type, department, location)
2. Assign to groups (Active Directory sync group, Okta group, Jamf smart group)
3. Device assignment (laptop) automatically triggers:
   - Application deployment via Jamf group membership
   - SaaS license provisioning via Okta group
   - Network access via AD group membership
4. Manager can view all assigned resources in single interface

### Use Case 2: Network Troubleshooting
1. User reports connectivity issue
2. Search for user → view assigned device
3. Device view shows network interfaces with IP addresses
4. Click interface → view connected switch port
5. Switch port shows VLAN configuration and trunk mode
6. Trace to upstream router interface
7. Identify misconfigured VLAN in visual topology

### Use Case 3: License Audit
1. Search for all software of type "Adobe Creative Cloud"
2. View SaaS service showing 50 licensed seats
3. View assigned users (45 active employees)
4. Identify 5 unused licenses
5. Check group assignments (deployed to "Designers" group via Jamf)
6. Cross-reference with active group members
7. Reclaim unused licenses or right-size contract

### Use Case 4: Data Center Power Planning
1. View all UPS devices in location "NYC DC"
2. For each UPS, view all powered devices via power_output IOs
3. Calculate total wattage on each UPS
4. Identify single-PSU devices (risk)
5. Plan redundant power paths
6. Generate power topology diagram
7. Document changes with updated rack diagram

### Use Case 5: Studio Equipment Tracking
1. Create room "Studio B Control Room"
2. Add devices: video router, audio mixer, capture cards
3. Document IOs: SDI inputs/outputs, HDMI connections, XLR audio
4. Map signal flow: Camera → Router Input 1 → Router Output 3 → Capture Card
5. Associate with vendor contracts for support
6. Link to external runbook in Confluence
7. Generate signal flow diagram

---

## User Interface Pages & Flows

### UI Philosophy

**Template-Driven Design**: Rather than creating unique screens for each object type, we use a unified template system that adapts based on object schema. This reduces development effort, ensures consistency, and makes the system easier to maintain and extend.

**Object Types**:
- **Standard Objects**: Use generic list/detail/form templates (devices, people, companies, locations, rooms, software, services, applications, licenses, groups, contracts, documents)
- **Specialized Objects**: Custom interfaces for unique workflows (networks, IOs, IP addresses, topology visualization, RBAC configuration)

### Navigation Structure

**Primary Navigation**:
- Dashboard (home)
- Objects (unified browser for all standard object types)
- Network (specialized tools: networks, IOs, IP addresses, topology)
- Admin (roles, permissions, settings, audit log)

### Core UI Templates

#### 1. Dashboard

**Home Page**
- **Purpose**: System overview and quick access to common tasks
- **Key Widgets**:
  - Expiring warranties (next 90 days)
  - Expiring licenses (next 60 days)
  - Contract renewals upcoming
  - Recent activity feed
  - Quick stats: total objects by type
  - Status breakdown charts
  - Top alerts/notifications
- **Quick Actions**: Create new object (type selector), run saved searches, generate reports
- **Access**: All authenticated users (content filtered by RBAC)

**Global Search** (always visible in header)
- Single search box with keyboard shortcut (/)
- Real-time suggestions grouped by object type
- Filter by object type dropdown
- Advanced filters slide-out panel
- Saved searches for power users
- Results show: object type icon, primary identifier, secondary info, status badge
- Click result → navigate to detail view

#### 2. Unified Object Browser

**Generic List View Template**
- **Purpose**: Browse and filter any standard object type
- **Applies To**: Devices, People, Companies, Locations, Rooms, Software, SaaS Services, Installed Applications, Licenses, Groups, Contracts, Documents, External Documents
- **Layout**:
  - **Header**: Object type selector dropdown, search box, primary action button ("Add [Type]")
  - **Filters Panel** (left sidebar, collapsible):
    - Dynamic filters based on object schema
    - Common: status, created date, updated date
    - Object-specific: device type, person type, company type, etc.
    - Active filter chips shown above table
  - **Table View**:
    - Configurable columns (drag to reorder, show/hide)
    - Sortable columns
    - Bulk selection with checkbox column
    - Status badge in dedicated column
    - Pagination (50 per page default, configurable)
  - **View Options**: Table/card toggle (where card view makes sense)
- **Bulk Actions Bar** (appears when items selected):
  - Common: Export CSV, delete
  - Object-specific: Assign location, change status, add to group, etc.
- **Secondary Actions**: Import CSV, export all, bulk edit, saved views

**Generic Detail View Template**
- **Purpose**: View/edit complete information for any standard object
- **Applies To**: All standard object types
- **Layout**:
  - **Header Bar**:
    - Breadcrumbs (object type > object name)
    - Primary identifier (large text)
    - Status badge
    - Action buttons (right-aligned): Edit, Delete, object-specific actions
  - **Quick Stats Row** (below header):
    - 3-5 key metrics in card format
    - Examples: "3 devices", "5 group memberships", "Active since 2023"
  - **Main Content** (tabbed interface):
    - **Overview Tab** (always first):
      - All primary fields from object schema
      - Organized in logical sections with headers
      - Read-only view with inline edit capability (Phase 2)
    - **Relationship Tabs** (dynamically generated):
      - One tab per relationship type
      - Shows related objects in embedded list view
      - Quick actions to add/remove relationships
      - Examples: "Devices" tab on Person, "Members" tab on Group
    - **History Tab** (always last):
      - Audit log: timestamp, user, action, changes (JSON diff)
      - Filterable by action type
  - **Relationships Panel** (right sidebar):
    - Quick links to key related objects
    - Hierarchical relationships (parent/children)
    - Clickable badges with counts
- **Actions**:
  - Primary: Edit (opens modal or slide-out form)
  - Secondary: Delete (with confirmation), Export, Print, Duplicate
  - Object-specific: "Add IO" for devices, "Assign Device" for people, etc.

**Generic Form Template** (modal or slide-out)
- **Purpose**: Create or edit any standard object
- **Applies To**: All standard object types
- **Layout**:
  - **Form Header**: "Add [Type]" or "Edit [Object Name]"
  - **Form Body** (scrollable):
    - Fields organized in collapsible sections
    - Section headers: Basic Information, Assignment, [Object-specific sections]
    - Field types: text input, dropdown, date picker, lookup (autocomplete), textarea, checkbox, number
    - Conditional fields: Show/hide based on other field values
    - Inline validation with error messages
  - **Form Footer**:
    - Cancel button (left)
    - Save button (right, primary color)
    - "Save & Add Another" option for rapid entry
- **UX Enhancements**:
  - Auto-save drafts (Phase 2)
  - Dependent dropdowns (e.g., room filtered by location)
  - Autocomplete lookups for relationships
  - Duplicate detection on key fields
  - Smart defaults based on context

#### 3. Specialized Views

**The following objects require custom interfaces due to unique workflows:**

**Network Management**

**Network Browser** (uses generic list template with custom columns)
- Table columns: network name, VLAN ID, network address, type, location, DHCP status
- Custom filters: DHCP enabled/disabled, network type
- Color coding by network type
- Actions: View topology button

**Network Detail** (uses generic detail template with custom tabs)
- Standard Overview tab with network-specific fields
- Custom tabs:
  - **IOs**: Table of interfaces (native + tagged) with inline trunk mode indicator
  - **IP Addresses**: IP allocation table with utilization bar chart
  - **Devices**: Auto-populated from IOs on this network
- Custom actions: "View Topology", "IP Usage Report"

**IP Address Management View** (specialized screen)
- **Purpose**: Dedicated IP management and visualization
- **Layout**:
  - Filter bar: Network selector, IP type, allocation status
  - Visual subnet map: Grid showing used (colored) vs available (gray) IPs
  - Table view: IP, device, IO, network, type, DNS name, assignment date
  - Subnet calculator tool (sidebar)
  - Conflict detection alerts
- **Actions**: Add IP, reserve IP, bulk import, export
- **Why specialized**: Unique visualization needs (subnet map), calculator tool

**Network Topology View** (Phase 2 - specialized visualization)
- **Purpose**: Interactive network diagram from IO relationships
- **Features**:
  - Canvas area: Interactive graph (drag nodes, zoom, pan)
  - Sidebar controls: Layout algorithm selector, filter options, legend
  - Node types: Devices (by type), networks (VLAN clouds)
  - Edge types: Physical connections, VLAN membership
  - Click node → open detail view in modal
  - Path highlighting tool
  - Export: PNG/SVG
- **Layout Options**: Hierarchical, force-directed, circular
- **Overlays**: Power topology, broadcast signal flow
- **Why specialized**: Complex graph visualization, interaction patterns unique to topology mapping

**Interface/Port (IO) Management** (modal/slide-out, not dedicated page)
- **Context**: Accessed from Device detail view → Network tab → "Add IO" button
- **Form**:
  - Interface name, type (dropdown)
  - Conditional fields based on type:
    - Network: speed, duplex, trunk mode, native VLAN, tagged VLANs, MAC
    - Power: voltage, amperage, wattage, connector type
    - Broadcast: media type (SDI/HDMI/XLR specific)
  - "Connect to IO" lookup (filtered by compatible types)
- **Why specialized**: Highly conditional form logic, immediate connectivity creation

**Document Editing** (specialized interface for `documents` table only)
- **Purpose**: Rich content editing for internal documentation
- **Layout** (full-page):
  - Header: Title, type, status, author, version
  - Main editor: Markdown editor with live preview (side-by-side)
  - Toolbar: Format buttons, insert image, code block, table
  - Related objects panel: Multi-object association manager
  - Version history panel (Phase 2): Diff viewer
- **Why specialized**: Rich text editing requires full-screen focus, preview mode

**RBAC Configuration**

**Role Permission Grid** (specialized interface, admin only)
- **Layout**:
  - Grid: Rows = object types, Columns = actions (view/edit/delete/manage_permissions)
  - Checkboxes for each combination
  - "Select All" options for rows and columns
  - Save/cancel buttons
- **Why specialized**: Matrix-based input pattern, not standard form

**Role Assignment Form** (modal with specialized logic)
- **Fields**:
  - Role selector
  - Assign to: Person or Group (radio toggle changes lookup type)
  - Scope selector: Global / Location-based / Specific objects (radio)
  - Conditional multi-select: Locations OR objects (with type filter)
- **Why specialized**: Cascading conditional logic, multiple entity type selection

**Reports & Analytics** (Phase 2)

**Reports Dashboard**
- **Layout**: Card grid of pre-built reports by category
- **Categories**: Asset, License, Network, Access, Financial
- **Card actions**: Run now, schedule, edit parameters
- Uses generic list template for report results

**Custom Report Builder** (Phase 2 - specialized wizard)
- **Steps**:
  1. Select data source (object type)
  2. Choose fields (drag-and-drop multi-select)
  3. Apply filters (filter builder interface)
  4. Set grouping/sorting
  5. Choose aggregations
  6. Preview results
  7. Save or export
- **Why specialized**: Multi-step wizard, drag-and-drop UI, query builder interface

**Bulk Operations** (Phase 2)

**Bulk Import Wizard** (specialized multi-step)
- **Steps**: Object type selection → CSV upload → field mapping → validation → preview → execute → results
- **Why specialized**: Multi-step process with file upload, field mapping UI

**Bulk Edit** (modal overlaying list view)
- Activated from any generic list view via checkbox selection
- Shows preview table of changes before commit
- Uses standard form controls for value input

**Settings & Configuration**

**User Settings** (uses generic form template with sections)
- Profile, Preferences, Notifications, API Access, Security
- Standard collapsible section layout

**System Settings** (uses generic form template with sections, admin only)
- General, Email, Authentication, Integrations, Backups, Audit Log
- Standard collapsible section layout with test buttons

**Audit Log View** (uses generic list template)
- Custom columns: timestamp, user, action, object type, object ID, changes, IP
- JSON diff viewer in expandable rows
- Standard filters and export

### Summary: Unified vs Specialized

**Standard Objects** (use unified templates):
- Devices, People, Companies, Locations, Rooms, Software, SaaS Services, Installed Applications, Licenses, Groups, Contracts, External Documents
- **Screens**: 3 templates (list, detail, form) × 12 object types = **36 views** reduced to **3 reusable templates**

**Specialized Views** (custom implementations):
1. Network Topology Visualization (Phase 2)
2. IP Address Management with subnet visualization
3. IO Management (modal with conditional fields)
4. Document Editor (Markdown with preview)
5. Role Permission Grid
6. Role Assignment (conditional scoping)
7. Custom Report Builder (Phase 2)
8. Bulk Import Wizard (Phase 2)

**Total Implementation**: 3 reusable templates + 8 specialized views = **11 unique UI implementations** (vs 40+ in previous design)

---

### Mobile Considerations

**Mobile-Responsive Priority**:
1. Dashboard (quick stats and alerts)
2. Global Search (with QR scanner for asset lookup)
3. Generic Detail View (optimized for small screens)
4. Generic List View (card view primary on mobile)

**Mobile-Specific Features**:
- QR code scanning for asset tags (opens detail view)
- Camera integration for device photos (from detail view)
- Offline mode for viewing cached objects
- Tap-to-call on phone numbers
- GPS location tagging for new device creation
- Simplified navigation (hamburger menu)
- Bottom tab bar for key functions (search, scan, add, profile)

**Mobile Adaptations**:
- Filter panel becomes bottom sheet
- Forms use full-screen modal
- Tables switch to card view automatically
- Relationship tabs become accordion sections
- Action buttons collapse into overflow menu (•••)

---

### UI/UX Patterns & Standards

**Consistent Components**:
- **Detail View Tabs**: Always use tab layout for complex objects (Overview, related objects, history)
- **List Views**: Support both table and card views where appropriate
- **Filters**: Sidebar filter panel (collapsible on mobile)
- **Actions**: Top-right action buttons (primary action prominent)
- **Breadcrumbs**: Always show navigation path
- **Quick Stats**: Dashboard-style widgets on detail views
- **Relationship Panels**: Right sidebar showing quick links to related objects

**Color Coding Standards**:
- Status: Active=green, Inactive=gray, Repair=yellow, Retired=light gray
- Criticality: Critical=red, High=orange, Medium=yellow, Low=green
- Alerts: Error=red, Warning=orange, Info=blue, Success=green
- Object Types: Consistent color per type (devices=blue, people=purple, networks=teal)

**Loading & Error States**:
- Skeleton screens while loading (not spinners)
- Inline error messages (not popups)
- Toast notifications for success actions
- Empty states with helpful guidance ("No devices yet. Add your first device.")

**Accessibility**:
- Keyboard navigation for all functions
- ARIA labels on interactive elements
- High contrast mode support
- Screen reader compatible
- Minimum font size 14px

---

## Design System

### Visual Design Strategy

**Do**:
- Use easily recognizable icons or illustrations with clear focal points
- Arrange elements in logical, easy-to-follow order
- Use scale and color to emphasize the most important parts
- Ensure sufficient contrast between text and background
- Offer text alternatives for images and multimedia content
- Design layouts that work on all devices and screen sizes

**Don't**:
- Use colors that feel aggressive or overwhelming
- Rely on visually negative or menacing aesthetic decisions
- Rely solely on abstract graphics or text
- Rely solely on color to communicate important information
- Create complicated or hidden navigation paths
- Use font sizes too small to read easily

### Typography

**Font Family**: Inter (headings and body copy)

**Type Scale**: Base 18px with 1.25 scale ratio
- Display: 72px (18 × 1.25^5)
- H1: 57.6px (18 × 1.25^4)
- H2: 46px (18 × 1.25^3)
- H3: 36.8px (18 × 1.25^2)
- H4: 29.4px (18 × 1.25^1.5)
- H5: 23.5px (18 × 1.25^1)
- Body: 18px (base)
- Small: 14.4px (18 ÷ 1.25)

**Typography Rules**:
- Always use consistent margins and generous padding with left-aligned type
- Always align typography to the grid
- Always use scale to create emphasis (not text case)
- Don't allow type to overflow into margins or crowd the composition
- Don't misalign type from the grid or allow elements to 'float'
- Don't use text case (UPPERCASE/lowercase) to create emphasis

### Layout Grid System

**Grid Structure**:
1. Use even numbers for column count (fits composition needs)
2. Margin = 1/4 column width
3. Gutter = 1/2 margin width
4. Columns are equalized and symmetrical

**Grid Application**:
- Use grid as primary reference for composition assembly
- Canvas width determines number of columns
- Maintain symmetrical proportions between columns
- Keep column widths equal across the layout

### Color Palette

**Primary Palette** (dominant in most applications):

| Color | Name | HEX | RGB | CMYK | Usage |
|-------|------|-----|-----|------|-------|
| ![#1C7FF2](https://via.placeholder.com/15/1C7FF2/1C7FF2.png) | Morning Blue | #1C7FF2 | 28/127/242 | 88/48/0/5 | Primary brand color, main actions, headers |
| ![#231F20](https://via.placeholder.com/15/231F20/231F20.png) | Brew Black | #231F20 | 35/31/32 | 0/11/9/86 | Text, dark UI elements |
| ![#FAF9F5](https://via.placeholder.com/15/FAF9F5/FAF9F5.png) | Off White | #FAF9F5 | 250/249/245 | 0/0/2/2 | Backgrounds, light UI elements |

**Secondary Palette** (complements, never overpowers primary):

| Color | Name | HEX | RGB | CMYK | Usage |
|-------|------|-----|-----|------|-------|
| ![#28C077](https://via.placeholder.com/15/28C077/28C077.png) | Green | #28C077 | 40/192/119 | 79/0/38/25 | Success states, active status |
| ![#BCF46E](https://via.placeholder.com/15/BCF46E/BCF46E.png) | Lime Green | #BCF46E | 188/244/110 | 23/0/55/4 | Accent, highlights |
| ![#ACD7FF](https://via.placeholder.com/15/ACD7FF/ACD7FF.png) | Light Blue | #ACD7FF | 172/215/255 | 33/16/0/0 | Info states, secondary actions |
| ![#FD6A3D](https://via.placeholder.com/15/FD6A3D/FD6A3D.png) | Orange | #FD6A3D | 253/106/61 | 0/58/76/1 | Warnings, medium priority |
| ![#FFBB5C](https://via.placeholder.com/15/FFBB5C/FFBB5C.png) | Tangerine | #FFBB5C | 255/187/92 | 0/27/64/0 | Attention, highlights |

### Color Usage Rules

**Font on Background Combinations**:
- Morning Blue background: Brew Black or Off White text
- Green background: Brew Black or Off White text
- Orange background: Brew Black or Off White text
- Light Blue background: Brew Black text only
- Lime Green background: Brew Black text only
- Tangerine background: Brew Black text only
- Off White background: Morning Blue or Brew Black text
- Brew Black background: All other colors allowed

**Block Layering** (approved combinations):
- Top: Morning Blue, Bottom: Light Blue
- Top: Tangerine, Bottom: Orange
- Top: Green, Bottom: Lime Green
- Top: Off White, Bottom: Morning Blue
- Top: Brew Black, Bottom: Any color except Off White

### Status & State Color Mapping

**Status Colors** (using design system palette):
- Active: Green (#28C077)
- Inactive: Light Blue (#ACD7FF)
- Repair/Warning: Orange (#FD6A3D) or Tangerine (#FFBB5C)
- Retired: Brew Black with reduced opacity (#231F20 at 40%)

**Criticality Colors**:
- Critical: Orange (#FD6A3D)
- High: Tangerine (#FFBB5C)
- Medium: Light Blue (#ACD7FF)
- Low: Green (#28C077)

**Alert Types**:
- Error: Orange (#FD6A3D)
- Warning: Tangerine (#FFBB5C)
- Info: Light Blue (#ACD7FF)
- Success: Green (#28C077)

**Primary Actions**: Morning Blue (#1C7FF2)
**Secondary Actions**: Light Blue (#ACD7FF)
**Destructive Actions**: Orange (#FD6A3D)

### Design System Implementation Notes

1. **Consistency**: Primary palette (Morning Blue, Brew Black, Off White) should be dominant
2. **Hierarchy**: Use type scale (not case changes) to create visual hierarchy
3. **Contrast**: Always ensure sufficient contrast between text and background
4. **Grid Alignment**: All elements must align to the grid system
5. **Color Meaning**: Never rely solely on color to communicate information
6. **Accessibility**: All color combinations must meet WCAG AA standards minimum

---

## Version History

**v1.2** - 2025-01-08 - Added design system specifications
- Typography system (Inter font, 18px base, 1.25 scale)
- Complete color palette (primary and secondary)
- Grid system specifications
- Color usage rules and approved combinations
- Status/state color mappings using design system palette

**v1.1** - 2025-01-08 - Added UI/UX specifications
- Complete page inventory (40+ pages/views)
- Navigation structure
- Mobile considerations
- UI/UX patterns and standards

**v1.0** - 2025-01-07 - Initial PRD
- Complete data model definition
- Core feature requirements
- Technical architecture overview
- Phased implementation plan