// =====================================================
// Field Workspace - Main Application
// Inspectie, Oplevering & Kwaliteitsborging
// =====================================================

const CATEGORY_KEYS = ['cat_bouwkundig','cat_schilderwerk','cat_sanitair','cat_elektra','cat_hvac','cat_dakwerk','cat_kozijnen','cat_vloeren','cat_buitenruimte','cat_veiligheid','cat_overig'];
const CATEGORY_VALUES = ['Bouwkundig','Schilderwerk','Sanitair','Elektra','HVAC','Dakwerk','Kozijnen','Vloeren','Buitenruimte','Veiligheid','Overig'];
const STATUS_KEYS = { open:'status_open', assigned:'status_assigned', completed:'status_completed', verified:'status_verified', archived:'status_archived' };
const PRIORITY_KEYS = { high:'pri_high', medium:'pri_medium', low:'pri_low' };
const SEVERITY_KEYS = { cosmetic:'sev_cosmetic', functional:'sev_functional', safety:'sev_safety', structural:'sev_structural' };
const HO_TYPE_KEYS = { pre:'ho_pre', first:'ho_first', second:'ho_second' };

class FieldWorkspace {
    constructor() {
        this.project = { name:'',number:'',client:'',contactPerson:'',address:'',postalCode:'',city:'',surveyDate:'',surveyor:'',description:'',notes:'',bagData:null };
        this.contacts = [];
        this.floorPlans = [];
        this.tickets = [];
        this.inspections = [];
        this.handovers = [];
        this.checklistTemplates = this.getDefaultTemplates();
        this.activeFloorPlanId = null;
        this.isAddingPoint = false;
        this.zoomLevel = 1;
        this.editingPointId = null;
        this.currentPhotos = [];
        this.currentInspectionId = null;
        this.currentHandoverId = null;
        this.activityLog = [];
        this.lang = 'en';
        this.ready = this.init();
    }

    async init() {
        this.bindEvents();
        this.setDefaultDate();
        await this.loadFromLocalStorage();
        this.validateAndCleanData();
        this.populateCategoryFilter();
        this.applyLanguage();
    }

    // =====================================================
    // INTERNATIONALIZATION
    // =====================================================
    t(key) {
        if (window.i18next) return window.i18next.t(key, { defaultValue: key });
        return key;
    }

    tFormat(key, ...args) {
        if (window.i18next) {
            const params = {};
            args.forEach((a, i) => { params[String(i)] = a; });
            // i18next interpolation: replace {0}, {1} etc.
            let s = window.i18next.t(key, { defaultValue: key });
            args.forEach((a, i) => { s = s.replace(`{${i}}`, a); });
            return s;
        }
        return key;
    }

    setLanguage(lang) {
        this.lang = 'en';
        localStorage.setItem('ofs_lang', 'en');
        if (window.i18next) window.i18next.changeLanguage('en');
        this.applyLanguage();
    }

    applyLanguage() {
        // data-i18n attributes (nav, headings)
        document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = this.t(el.dataset.i18n); });

        // Update active lang button
        document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === this.lang));

        // Project form labels and placeholders
        const lp = (id, labelKey, phKey) => {
            const el = document.getElementById(id);
            if (!el) return;
            const label = el.closest('.form-group')?.querySelector('label');
            if (label) label.textContent = this.t(labelKey);
            if (phKey && el.placeholder !== undefined) el.placeholder = this.t(phKey);
        };
        lp('project-name','lbl_name','ph_name'); lp('project-number','lbl_number','ph_number');
        lp('client-name','lbl_client','ph_client'); lp('contact-person','lbl_contact','ph_contact');
        lp('street-address','lbl_address','ph_address'); lp('postal-code','lbl_postal','ph_postal');
        lp('city','lbl_city','ph_city'); lp('survey-date','lbl_date');
        lp('surveyor','lbl_surveyor','ph_surveyor'); lp('project-description','lbl_description','ph_description');
        lp('project-notes','lbl_notes','ph_notes');

        // Static headings and buttons via query.
        // Preserve child elements (SVG icons) by only replacing the trailing text node — or appending one if missing.
        const setText = (sel, key) => {
            const el = document.querySelector(sel);
            if (!el) return;
            const label = this.t(key);
            if (el.children.length === 0) { el.textContent = label; return; }
            // Find the last text node; if none, append one.
            let node = null;
            for (let i = el.childNodes.length - 1; i >= 0; i--) {
                if (el.childNodes[i].nodeType === Node.TEXT_NODE) { node = el.childNodes[i]; break; }
            }
            const spaced = ' ' + label;
            if (node) node.nodeValue = spaced;
            else el.appendChild(document.createTextNode(spaced));
        };
        const setTitle = (sel, key) => { const el = document.querySelector(sel); if (el) el.title = this.t(key); };

        // Project tab
        setText('#project-tab > .panel > h2', 'h_project');
        setText('#save-project', 'btn_save_project');
        setText('#add-contact-btn', 'btn_add_contact');
        setText('#project-tab > .panel > h2:nth-of-type(2)', 'h_contacts');

        // BAG lookup button, modal and verified badge
        const bagBtn = document.getElementById('bag-lookup-btn');
        if (bagBtn) {
            const label = bagBtn.querySelector('svg')?.nextSibling;
            if (label && label.nodeType === Node.TEXT_NODE) label.textContent = ' ' + this.t('bag_lookup_btn');
            else bagBtn.append(document.createTextNode(' ' + this.t('bag_lookup_btn')));
        }
        setText('#bag-modal-title', 'bag_modal_title');
        const lbl = (inputId, key) => {
            const el = document.getElementById(inputId);
            const l = el?.closest('.form-group')?.querySelector('label');
            if (l) l.textContent = this.t(key);
        };
        lbl('bag-postcode-input', 'bag_lbl_postcode');
        lbl('bag-huisnr-input', 'bag_lbl_huisnr');
        lbl('bag-toev-input', 'bag_lbl_toev');
        setText('#bag-search', 'bag_search');
        setText('#bag-cancel', 'bag_cancel');
        setText('#bag-key-summary', 'bag_key_summary');
        setText('#bag-apikey-save', 'bag_apikey_save');
        const help = document.getElementById('bag-key-help');
        if (help) help.textContent = this.t('bag_key_help');
        const apk = document.getElementById('bag-apikey-input'); if (apk) apk.placeholder = this.t('bag_apikey_placeholder');
        this.refreshBagBadge();

        // Plattegrond tab
        setText('#plattegrond-tab h2', 'h_plans');

        // IFC / 3D BIM tab
        setText('#ifc-h2', 'ifc_h2');
        setText('#ifc-upload-text', 'ifc_upload_text');
        setText('#ifc-info-txt', 'ifc_info');
        setText('#floor-plan-upload > p', 'upload_text');
        setText('#floor-plan-upload > .upload-hint', 'upload_hint');

        // Opname tab
        setText('#canvas-placeholder p', 'placeholder_canvas');
        // Update tickets heading but preserve the badge span
        const ticketsH3 = document.querySelector('.points-panel h3');
        if (ticketsH3) {
            const badge = ticketsH3.querySelector('#ticket-count');
            const badgeVal = badge ? badge.textContent : '0';
            ticketsH3.innerHTML = `${this.t('h_tickets')} <span id="ticket-count" class="badge">${badgeVal}</span>`;
        }
        setText('#points-list .empty-state', 'empty_tickets');
        setTitle('#add-point-btn', 'btn_add_ticket');
        setTitle('#zoom-in-btn', 'tb_zoom_in');
        setTitle('#zoom-out-btn', 'tb_zoom_out');
        setTitle('#zoom-fit-btn', 'tb_zoom_fit');

        // Inspectie tab
        setText('#inspectie-overview h2', 'h_inspections');
        setText('#new-inspection-btn', 'btn_new_inspection');
        setText('#inspections-list .empty-state', 'empty_inspections');
        setText('#inspectie-setup h2', 'h_new_inspection');
        setText('#cancel-inspection-setup', 'btn_cancel');
        setText('#start-inspection-btn', 'btn_start_inspection');
        setText('#back-to-inspections', 'btn_back');
        setText('#finish-inspection-btn', 'btn_finish_inspection');
        setText('#inspectie-sign h2', 'h_sign');
        setText('#clear-signature', 'btn_clear');
        setText('#cancel-sign', 'btn_cancel');
        setText('#confirm-sign', 'btn_sign');

        // Oplevering tab
        setText('#oplevering-overview h2', 'h_handovers');
        setText('#new-handover-btn', 'btn_new_handover');
        setText('#handovers-list .empty-state', 'empty_handovers');
        setText('#oplevering-setup h2', 'h_new_handover');
        setText('#add-ho-participant', 'btn_add_participant');
        setText('#cancel-handover-setup', 'btn_cancel');
        setText('#start-handover-btn', 'btn_start_handover');
        setText('#back-to-handovers', 'btn_back');
        setText('#finish-handover-btn', 'btn_finish_handover');
        setText('#oplevering-sign h2', 'h_ho_sign');
        setText('#add-ho-signature', 'btn_add_signature');
        setText('#cancel-ho-sign', 'btn_back');
        setText('#confirm-ho-sign', 'btn_sign');

        // Export tab
        setText('#export-tab h2', 'h_export');
        setText('#export-pdf', 'btn_export_pdf');
        setText('#export-html', 'btn_export_html');
        setText('#export-bcf', 'btn_export_bcf');
        setText('#sync-kyp', 'btn_sync_kyp');
        setText('#connectors-h2', 'connectors_h2');
        setText('#import-cancel', 'import_close');
        setText('#import-confirm', 'import_confirm_btn');
        setText('#project-import-btn', 'btn_project_import');
        this.refreshProjectImportBtn();
        const cIntro = document.getElementById('connectors-intro');
        if (cIntro) cIntro.textContent = this.t('connectors_intro');
        // Re-render if the tab is visible
        if (document.getElementById('koppelingen-tab')?.classList.contains('active')) this.renderConnectorsList();
        setText('#save-json', 'btn_save_json');
        setText('#load-json', 'btn_load_json');
        setText('#clear-data', 'btn_clear_all');

        // Ticket modal
        lp('point-label','lbl_label','ph_label'); lp('point-description','lbl_desc','ph_desc');
        lp('point-deadline','lbl_deadline');
        setText('#cancel-point', 'btn_cancel');
        setText('#delete-point', 'btn_remove');
        setText('#save-point', 'btn_save');
        setText('#add-comment-btn', 'btn_send');
        setText('#photo-upload p', 'upload_photos');
        setText('#camera-btn', 'btn_camera');

        // Contact modal
        setText('#cancel-contact', 'btn_cancel');
        setText('#delete-contact', 'btn_remove');
        setText('#save-contact', 'btn_save');
        lp('contact-name-input','lbl_contact_name','ph_contact_name');
        lp('contact-company-input','lbl_contact_company','ph_contact_company');
        lp('contact-email-input','lbl_contact_email','ph_contact_email');
        lp('contact-phone-input','lbl_contact_phone','ph_contact_phone');

        // Camera modal
        setText('#camera-cancel', 'btn_close');

        // Inspectie form
        lp('insp-name','lbl_insp_name'); lp('insp-inspector','lbl_inspector');
        lp('insp-notes','lbl_general_notes','ph_insp_notes');
        lp('sign-name','lbl_sign_name','ph_sign_name');

        // Handover form labels
        lp('ho-notes','lbl_notes');

        // Select options that need translation
        const setOpt = (selId, valMap) => {
            const sel = document.getElementById(selId);
            if (!sel) return;
            sel.querySelectorAll('option').forEach(opt => {
                if (valMap[opt.value] !== undefined) opt.textContent = this.t(valMap[opt.value]);
            });
        };
        setOpt('filter-status', {'':'filter_all_status', open:'status_open', assigned:'status_assigned', completed:'status_completed', verified:'status_verified'});
        setOpt('filter-priority', {'':'filter_all_pri', high:'pri_high', medium:'pri_medium', low:'pri_low'});
        setOpt('point-priority', {high:'pri_high', medium:'pri_medium', low:'pri_low'});
        setOpt('point-severity', {cosmetic:'sev_cosmetic', functional:'sev_functional', safety:'sev_safety', structural:'sev_structural'});
        setOpt('point-status', {open:'status_open', assigned:'status_assigned', completed:'status_completed', verified:'status_verified'});
        setOpt('insp-type', {general:'type_free', checklist:'type_checklist'});
        setOpt('ho-type', {pre:'ho_pre', first:'ho_first', second:'ho_second'});
        setOpt('ho-verdict', {approved:'verdict_approved', conditional:'verdict_conditional', rejected:'verdict_rejected'});

        // Export radio labels
        const setRadio = (val, key) => { const r = document.querySelector(`input[name="export-type"][value="${val}"]`); if (r && r.parentElement) { r.parentElement.childNodes[1].textContent = ' ' + this.t(key); } };
        setRadio('full','export_full'); setRadio('tickets','export_tickets');
        setRadio('inspection','export_inspection'); setRadio('handover','export_handover');

        // Export checkboxes
        const setCb = (id, key) => { const cb = document.getElementById(id); if (cb) { const span = cb.parentElement.querySelector('span'); if (span) span.textContent = this.t(key); } };
        setCb('include-photos','opt_photos'); setCb('include-map','opt_map');

        // Toolbar titles
        setTitle('#theme-toggle', 'tb_theme');
        setTitle('#tb-lang-toggle', 'tb_language');
        setTitle('#tb-minimize', 'tb_minimize');
        setTitle('#tb-maximize', 'tb_maximize');
        setTitle('#tb-close', 'tb_close_window');

        // Dashboard stat cards
        const setStatLabel = (id, key) => { const el = document.querySelector(`#${id} h4`); if (el) el.textContent = this.t(key); };
        setStatLabel('stat-total','stat_total'); setStatLabel('stat-open','stat_open');
        setStatLabel('stat-assigned','stat_assigned'); setStatLabel('stat-completed','stat_completed');
        setStatLabel('stat-overdue','stat_overdue'); setStatLabel('stat-inspections','stat_inspections');

        // Dashboard panel headings
        const dashPanels = document.querySelectorAll('.dashboard-panels .panel h3');
        if (dashPanels[0]) dashPanels[0].textContent = this.t('chart_status');
        if (dashPanels[1]) dashPanels[1].textContent = this.t('chart_category');
        if (dashPanels[2]) dashPanels[2].textContent = this.t('chart_assignee');
        if (dashPanels[3]) dashPanels[3].textContent = this.t('chart_activity');

        // Export preview headings
        const expH3 = document.querySelectorAll('.export-options h3');
        if (expH3[0]) expH3[0].textContent = this.t('h_report_type');
        if (expH3[1]) expH3[1].textContent = this.t('h_options');
        setText('.export-preview h3', 'h_overview');

        // Re-render dynamic content
        this.populateCategoryFilter();
        this.renderPointsList();
        this.renderContacts();
        this.renderInspectionsList();
        this.renderHandoversList();
        this.renderManual();
        this.updateStatusBar();
        if (document.getElementById('dashboard-tab').classList.contains('active')) this.updateDashboard();
    }

    renderManual() {
        const el = document.getElementById('manual-content');
        if (el) el.innerHTML = this.t('manual_html');
    }

    updateStatusBar() {
        const sbProject = document.getElementById('sb-project');
        const sbTickets = document.getElementById('sb-tickets');
        const sbPlans = document.getElementById('sb-plans');
        const sbSaved = document.getElementById('sb-saved');
        if (sbProject) sbProject.textContent = this.project.name || '—';
        if (sbTickets) sbTickets.textContent = `${this.tickets.length} ${this.t('sum_tickets')}`;
        if (sbPlans) sbPlans.textContent = `${this.floorPlans.length} ${this.t('sum_plans')}`;
        if (sbSaved) sbSaved.textContent = this._lastSaved || '—';
    }

    // Translated label helpers
    statusLabel(s) { return this.t(STATUS_KEYS[s] || 'status_open'); }
    priorityLabel(p) { return this.t(PRIORITY_KEYS[p] || 'pri_medium'); }
    severityLabel(s) { return this.t(SEVERITY_KEYS[s] || 'sev_cosmetic'); }
    hoTypeLabel(t) { return this.t(HO_TYPE_KEYS[t] || t); }
    categoryLabel(c) { const idx = CATEGORY_VALUES.indexOf(c); return idx >= 0 ? this.t(CATEGORY_KEYS[idx]) : c; }

    // =====================================================
    // DEFAULT CHECKLIST TEMPLATES
    // =====================================================
    getDefaultTemplates() {
        // Steno-helpers voor item-objecten
        const c  = (q)           => ({ q, type: 'check' });
        const n  = (q, unit)     => ({ q, type: 'number', unit });
        const t  = (q)           => ({ q, type: 'text' });
        const s  = (q, options)  => ({ q, type: 'select', options });
        const p  = (q)           => ({ q, type: 'photo' });
        const nn = (q)           => ({ q, type: 'nen2767' });
        return [
            {
                id: 'tpl_bouwkundig', name: 'Bouwkundige opname', category: 'Bouwkundig',
                items: [
                    c('Staat van het metselwerk / gevelstenen'),
                    c('Voegen in goede conditie'),
                    c('Betonwerk vrij van scheuren'),
                    c('Houten constructiedelen vrij van rot'),
                    c('Staalconstructie vrij van roest'),
                    c('Dakbedekking waterdicht'),
                    c('Dakgoten en hemelwaterafvoer functioneel'),
                    c('Kozijnen in goede staat'),
                    c('Beglazing heel en goed gekit'),
                    c('Buitendeuren sluiten goed'),
                    c('Vloeren vlak en zonder scheuren'),
                    c('Wanden recht en zonder scheuren'),
                    c('Plafonds vrij van vlekken/scheuren'),
                    c('Trappen veilig en stevig'),
                    c('Balkon/galerij in goede staat'),
                    c('Fundering geen zichtbare gebreken')
                ]
            },
            {
                id: 'tpl_installatie', name: 'Installatie-inspectie', category: 'Installaties',
                items: [
                    c('Elektra: groepenkast correct gelabeld'),
                    c('Elektra: aardlekschakelaars werken'),
                    c('Elektra: stopcontacten functioneel'),
                    c('Elektra: verlichtingspunten werken'),
                    c('Water: geen lekkages zichtbaar'),
                    c('Water: warm watervoorziening werkt'),
                    c('Water: waterdruk voldoende'),
                    c('Sanitair: toiletten spoelen goed'),
                    c('Sanitair: kranen lekvrij'),
                    c('Verwarming: radiatoren worden warm'),
                    c('Verwarming: thermostaat functioneel'),
                    c('Ventilatie: mechanische ventilatie werkt'),
                    c('Ventilatie: roosters open en schoon'),
                    c('Ventilatie: afzuiging keuken/badkamer werkt'),
                    c('Gas: leidingen lekvrij'),
                    c('Intercom/belsysteem werkt')
                ]
            },
            {
                id: 'tpl_veiligheid', name: 'Veiligheidsinspectie', category: 'Veiligheid',
                items: [
                    c('Rookmelders aanwezig en werkend'),
                    c('CO-melders aanwezig (bij gastoestellen)'),
                    c('Brandblusser aanwezig en gekeurd'),
                    c('Vluchtwegen vrij en gemarkeerd'),
                    c('Noodverlichting functioneel'),
                    c('Brandwerende deuren sluiten goed'),
                    c('Trapleuningen stevig bevestigd'),
                    c('Glazen puien gemarkeerd'),
                    c('Elektrische installatie NEN 1010 conform'),
                    c('Gasinstallatie gekeurd'),
                    c('Valbeveiliging op hoogte aanwezig'),
                    c('EHBO-voorzieningen aanwezig'),
                    c('Veiligheidsglas waar vereist'),
                    c('Anti-slip voorzieningen natte ruimtes')
                ]
            },
            {
                id: 'tpl_oplevering', name: 'Oplevering voorinspectie', category: 'Oplevering',
                items: [
                    c('Schilderwerk: dekkend en strak afgewerkt'),
                    c('Schilderwerk: geen verfdruppels/vlekken'),
                    c('Behang: strak geplakt, geen bobbels'),
                    c('Tegelwerk: rechte voegen, geen beschadigingen'),
                    c('Voegen: netjes afgewerkt'),
                    c('Kitwerk: strak aangebracht'),
                    c('Plinten: recht en netjes bevestigd'),
                    c('Deuren: sluiten goed, geen klemmen'),
                    c('Ramen: openen en sluiten soepel'),
                    c('Vloer: schoon en onbeschadigd'),
                    c('Schoonmaak: bouwstof verwijderd'),
                    c('Schoonmaak: ramen gewassen'),
                    c('Alle ruimtes toegankelijk'),
                    c('Sleutels/tags compleet'),
                    c('Handleidingen aanwezig'),
                    t('Meterstanden (elektra / gas / water)')
                ]
            },
            {
                id: 'tpl_wkb', name: 'Wkb-basiscontrole', category: 'Wkb',
                items: [
                    c('Constructieve veiligheid: conform berekening'),
                    c('Brandveiligheid: compartimentering correct'),
                    c('Brandveiligheid: vluchtroutes conform ontwerp'),
                    c('Gebruiksveiligheid: trappen conform Bouwbesluit'),
                    c('Gebruiksveiligheid: balustrades juiste hoogte'),
                    c('Energieprestatie: isolatie conform EPC-berekening'),
                    c('Energieprestatie: luchtdichtheid gemeten'),
                    c('Geluid: contactgeluidisolatie voldoende'),
                    c('Geluid: luchtgeluidisolatie voldoende'),
                    c('Ventilatie: capaciteit conform Bouwbesluit'),
                    c('Daglicht: raamoppervlak voldoende'),
                    c('Toegankelijkheid: drempels conform eisen'),
                    c('Waterhuishouding: afvoer hemelwater correct'),
                    c('Funderingsrapport beschikbaar'),
                    c('Constructieberekening beschikbaar'),
                    c('Borgingsplan gevolgd')
                ]
            },
            // ===== INSTALLATEUR TEMPLATES =====
            {
                id: 'tpl_vloerverwarming_voor', name: 'Vloerverwarming - Voorinspectie', category: 'Installatie',
                items: [
                    c('Warmteverliesberekening aanwezig (ISSO 51 / NEN-EN 12831)'),
                    c('Ondergrond vlak, droog en structureel geschikt'),
                    c('Isolatie aanwezig met voldoende Rc-waarde (≥ 3,0 m²K/W)'),
                    n('Gemeten Rc-waarde isolatie', 'm²K/W'),
                    c('Minimale dekking boven leidingen ≥ 25 mm (ISSO 49)'),
                    c('Hotspot-checklist legionella uitgevoerd (ISSO 110970)'),
                    c('Verlegtekeningen beschikbaar en correct'),
                    c('Drukverliesberekeningen per groep aanwezig'),
                    c('Randzone/verblijfszone-indeling conform ontwerp'),
                    c('Buigradius leidingen conform voorschrift fabrikant'),
                    c('Verdeler correct geplaatst en gelabeld per groep'),
                    n('Max. drukverlies per groep gemeten', 'kPa'),
                    n('Ingestelde aanvoertemperatuur', '°C'),
                    c('CE-markering alle componenten aanwezig'),
                    c('Verwerkingsvoorschriften fabrikant op locatie beschikbaar')
                ]
            },
            {
                id: 'tpl_vloerverwarming_opl', name: 'Vloerverwarming - Druktest & Oplevering', category: 'Installatie',
                items: [
                    c('Druktest uitgevoerd VOOR storten dekvloer'),
                    c('Druktest per groep gedocumenteerd (druk, duur, resultaat)'),
                    n('Druktest drukwaarde', 'kPa'),
                    c('Drukniveau stabiel gedurende voorgeschreven periode'),
                    c('Spoelprotocol per groep uitgevoerd (lucht en vuil verwijderd)'),
                    c('Waterzijdig inregelen uitgevoerd per groep'),
                    c('Inregelstaten per groep vastgelegd en gedocumenteerd'),
                    c('Opstookprotocol gevolgd (geleidelijke temperatuurverhoging)'),
                    c('Thermografische inspectie uitgevoerd (warmtebeeld)'),
                    c('Geen koude zones of luchtinsluiting geconstateerd'),
                    c('Verlegtekeningen as-built bijgewerkt'),
                    p('Foto\'s leidingwerk voor bedekking'),
                    c('Conformiteitsverklaringen en certificaten compleet'),
                    c('Opleverdossier samengesteld conform Wkb-dossierplicht'),
                    c('Systeemdocumentatie overhandigd aan opdrachtgever'),
                    c('Garantieverklaring afgegeven')
                ]
            },
            {
                id: 'tpl_ventilatie_install', name: 'Ventilatie - Kanaalwerk & Installatie', category: 'Installatie',
                items: [
                    c('Ventilatieberekening aanwezig conform NEN 1087'),
                    c('Kanalen schoon, vrij van beschadigingen en obstakels'),
                    c('Luchtdichtheidstest kanalen uitgevoerd (NEN-EN 15727)'),
                    s('Luchtdichtheidsklasse kanaalwerk', ['ATC2', 'ATC3', 'ATC4', 'ATC5']),
                    c('Alle aansluitingen afgedicht en correct gemonteerd'),
                    c('Flexibele verbindingen correct aangebracht (geen knikken)'),
                    c('Isolatie kanaalwerk aanwezig en compleet'),
                    c('WTW-unit correct geplaatst en bereikbaar voor onderhoud'),
                    n('Luchtsnelheid buitenluchtaanzuiging', 'm/s'),
                    c('Filters geplaatst conform NEN-EN-ISO 16890'),
                    c('Condensafvoer correct aangesloten en afschot gecontroleerd'),
                    n('Geluidsniveau verblijfsruimten', 'dB(A)'),
                    c('CE-markering alle componenten aanwezig'),
                    c('Elektra-aansluiting conform NEN 1010')
                ]
            },
            {
                id: 'tpl_ventilatie_opl', name: 'Ventilatie - Inregelen & Oplevering', category: 'Installatie',
                items: [
                    c('Alle ventielen volledig geopend voor startmeting'),
                    c('Totaal luchtdebiet ingesteld op WTW-unit'),
                    c('Debietmeting per toevoerpunt uitgevoerd en genoteerd'),
                    c('Debietmeting per afzuigpunt uitgevoerd en genoteerd'),
                    n('Woonkamer: gemeten toevoerdebiet', 'dm³/s'),
                    n('Keuken: gemeten afzuigdebiet', 'dm³/s'),
                    n('Badkamer: gemeten afzuigdebiet', 'dm³/s'),
                    n('Toilet: gemeten afzuigdebiet', 'dm³/s'),
                    n('Slaapkamers: gemeten toevoerdebiet (totaal)', 'dm³/s'),
                    c('Balans toevoer en afvoer correct (geen over-/onderdruk)'),
                    n('CO2-meting verblijfsruimte', 'ppm'),
                    c('Temperatuurmeting toevoer/afvoer uitgevoerd'),
                    n('Geluidsniveau per ruimte', 'dB(A)'),
                    c('Meetrapport opgesteld met alle waarden per ventilatiepunt'),
                    c('Opleverdossier compleet conform Wkb-dossierplicht'),
                    c('Instructie bewoner/gebruiker uitgevoerd (filteronderhoud, bediening)')
                ]
            },
            {
                id: 'tpl_installatie_nen2767', name: 'Installatie - NEN 2767 Conditiemeting', category: 'Installatie',
                scoring: 'nen2767',
                items: [
                    nn('Verwarmingsinstallatie (ketel / warmtepomp)'),
                    nn('Vloerverwarmingssysteem'),
                    nn('Radiatoren / convectoren'),
                    nn('Verdeler / collectoren vloerverwarming'),
                    nn('Leidingwerk verwarming'),
                    nn('Mechanische ventilatie-unit (WTW / MVS)'),
                    nn('Kanaalwerk ventilatie'),
                    nn('Ventielen en roosters'),
                    nn('Filters luchtbehandeling'),
                    nn('Koudwaterinstallatie'),
                    nn('Warmwaterinstallatie (boiler / doorstromer)'),
                    nn('Riolering en afvoerleidingen'),
                    nn('Elektrische installatie / groepenkast'),
                    nn('Schakelmateriaal en wandcontactdozen'),
                    nn('Brandbeveiligingsinstallatie'),
                    nn('Zonwering en regeling'),
                    nn('Domotica / gebouwautomatisering'),
                    nn('Koelinstallatie (indien aanwezig)')
                ]
            },
            // ===== ENERGIELABEL TEMPLATE =====
            {
                id: 'tpl_energielabel', name: 'Energielabel - Volledige opname', category: 'Energielabel',
                items: [
                    // --- Woninggegevens ---
                    s('Woningtype', ['Vrijstaand', '2-onder-1-kap', 'Rijwoning', 'Hoekwoning', 'Appartement']),
                    n('Bouwjaar', 'jaar'),
                    n('Gebruiksoppervlak (GO)', 'm²'),
                    n('Aantal bouwlagen', ''),
                    s('Kruipruimte', ['Aanwezig', 'Niet aanwezig']),
                    // --- Gebouwschil ---
                    t('Gevelisolatie: type en dikte'),
                    c('Spouwmuurisolatie aanwezig'),
                    t('Dakisolatie: type en dikte'),
                    n('Dakisolatie Rc-waarde', 'm²K/W'),
                    t('Vloerisolatie: type en dikte'),
                    c('Vloerisolatie: kruipruimte geïsoleerd'),
                    t('Kozijnen: materiaal en staat'),
                    s('Beglazing type', ['Enkel glas', 'Dubbel glas', 'HR glas', 'HR+ glas', 'HR++ glas', 'Triple glas']),
                    n('Beglazing U-waarde', 'W/m²K'),
                    c('Kierdichting: tochtstrippen en kitten in orde'),
                    c('Luchtdichtheid: geen zichtbare kieren/naden'),
                    c('Thermische bruggen geïdentificeerd'),
                    t('Oriëntatie en beschaduwing'),
                    // --- Verwarming ---
                    s('Verwarmingssysteem', ['CV-ketel', 'Warmtepomp', 'Stadsverwarming', 'Elektrisch', 'Hybride warmtepomp']),
                    t('Merk, type en bouwjaar ketel/warmtepomp'),
                    t('HR-label en rendement'),
                    s('Afgiftesysteem verwarming', ['Radiatoren', 'Vloerverwarming', 'Luchtverwarming', 'Combinatie']),
                    s('Regelingstype', ['Thermostaat', 'Zonesturing', 'Slimme thermostaat', 'Geen regeling']),
                    // --- Warm water ---
                    s('Warm water: type opwekking', ['Combi-ketel', 'Aparte boiler', 'Warmtepomp boiler', 'Zonneboiler', 'Doorstroomboiler']),
                    s('Warm water: apart of combi', ['Combinatie met verwarming', 'Apart systeem']),
                    // --- Ventilatie ---
                    s('Ventilatiesysteem', ['Systeem A (natuurlijk)', 'Systeem B', 'Systeem C (mechanisch)', 'Systeem D (WTW)']),
                    n('WTW rendement', '%'),
                    c('CO2-gestuurd of vraaggestuurd'),
                    // --- Koeling ---
                    s('Koelsysteem', ['Geen', 'Airco', 'Warmtepomp koeling', 'WKO']),
                    n('Koeling SEER-waarde', ''),
                    // --- Duurzame energie ---
                    n('Zonnepanelen: aantal', 'stuks'),
                    n('Zonnepanelen: vermogen', 'Wp'),
                    t('Zonnepanelen: merk en type'),
                    c('Zonnepanelen: factuur/documentatie aanwezig'),
                    c('Zonneboiler aanwezig'),
                    c('Energieopslag: batterijsysteem aanwezig'),
                    s('Gasaansluiting', ['Aanwezig', 'Verwijderd', 'Nooit aanwezig geweest']),
                    c('Gebouwautomatisering: slim regelsysteem aanwezig'),
                    // --- Fotodocumentatie ---
                    p('Foto: voor- en achtergevel'),
                    p('Foto: CV-ketel / warmtepomp typeplaatje'),
                    p('Foto: groepenkast'),
                    p('Foto: zonnepanelen (aantal telbaar)'),
                    p('Foto: ventilatie unit en roosters'),
                    p('Foto: beglazing (type herkenbaar)'),
                    // --- Afsluiting ---
                    c('Bewijsstukken facturen isolatie/installaties verzameld'),
                    c('EP-Online registratie: gegevens compleet voor invoer')
                ]
            },
            // ===== MONUMENT TEMPLATES =====
            {
                id: 'tpl_monument_constructie', name: 'Monument - Constructie & Schil', category: 'Monument',
                scoring: 'nen2767',
                items: [
                    nn('Fundering: type en zichtbare staat'),
                    nn('Fundering: zettingsverschillen of verzakking'),
                    nn('Dragende muren: scheuren of vervorming'),
                    nn('Metselwerk: voegwerk staat'),
                    nn('Metselwerk: baksteenconditie (verwering/afbladdering)'),
                    nn('Metselwerk: zoutuitbloei (efflorescentie)'),
                    nn('Natuursteen: verwering en afschilfering'),
                    nn('Houtconstructie: balken en spanten op rot/insect'),
                    nn('Houtconstructie: verbindingen en opleggingen'),
                    nn('Dakconstructie: gordingen en sporen'),
                    nn('Dakbedekking: leien/pannen/lood/zink staat'),
                    nn('Dakgoten en hemelwaterafvoer'),
                    nn('Schoorstenen: metselwerk en voegwerk'),
                    nn('Gevelankers: aanwezig en functioneel'),
                    nn('Kozijnen: origineel houtwerk staat'),
                    nn('Ramen: originele beglazing en loodwerk'),
                    nn('Luiken en blinden: staat en bevestiging'),
                    nn('Geveldecoratie: lijstwerk, ornamenten, reliëfs')
                ]
            },
            {
                id: 'tpl_monument_interieur', name: 'Monument - Historisch Interieur', category: 'Monument',
                scoring: 'nen2767',
                items: [
                    nn('Originele vloeren: type, materiaal en conditie'),
                    nn('Originele plafonds: stucwerk, balken, ornamenten'),
                    nn('Originele wanden: betimmering, lambrisering'),
                    nn('Schouwen en haarden: staat en volledigheid'),
                    nn('Trappen: origineel houtwerk en leuningen'),
                    nn('Deuren: originele paneeldeuren en beslag'),
                    nn('Raamluiken: binnenzijde origineel'),
                    nn('Tegeltableaus: compleet en onbeschadigd'),
                    nn('Schilderingen/muurschilderingen: zichtbaar of verborgen'),
                    nn('Glas-in-lood: staat en volledigheid'),
                    nn('Smeedwerk: trapleuningen, hekwerken, beslag'),
                    nn('Plafondrozetten en lijstwerk'),
                    nn('Originele verflagen: kleuronderzoek nodig'),
                    nn('Keldergewelven: metselwerk staat'),
                    nn('Zolderruimte: originele elementen zichtbaar')
                ]
            },
            {
                id: 'tpl_monument_schade', name: 'Monument - Vocht & Schade', category: 'Monument',
                scoring: 'nen2767',
                items: [
                    nn('Vochtmeting: muren begane grond'),
                    nn('Vochtmeting: kelderwanden'),
                    nn('Optrekkend vocht: zichtbare vochtgrens'),
                    nn('Inregenend vocht: gevel en kozijnaansluitingen'),
                    nn('Condensvocht: ramen en koudebruggen'),
                    nn('Schimmels: zichtbare schimmelvorming locaties'),
                    nn('Algen/mossen: gevel en dak'),
                    nn('Zoutschade: locaties en ernst'),
                    nn('Houtaantasting: zwam of boktor'),
                    nn('Scheuren: locatie, richting en breedte'),
                    n('Scheurwijdte (max. gemeten)', 'mm'),
                    nn('Scheuren: actief of historisch'),
                    nn('Verzakking: zichtbare scheefstand'),
                    nn('Afbladdering: verf en coating'),
                    nn('Verwering: natuursteen oppervlak'),
                    nn('Vorstschade: baksteen en voegen'),
                    nn('Loodwerk: daksluitingen en goten'),
                    nn('Zinkwerk: staat en aansluiting'),
                    nn('Biologische aantasting: klimop/begroeiing')
                ]
            },
            {
                id: 'tpl_monument_onderhoud', name: 'Monument - Instandhoudingsplan', category: 'Monument',
                scoring: 'nen2767',
                items: [
                    nn('Dak: urgentie onderhoud'),
                    nn('Gevel: urgentie voegwerk herstel'),
                    nn('Kozijnen: urgentie schilderwerk'),
                    nn('Hemelwaterafvoer: reiniging en reparatie'),
                    nn('Schilderwerk buiten: urgentie'),
                    nn('Schilderwerk binnen: urgentie'),
                    nn('Lood- en zinkwerk: vervanging/reparatie nodig'),
                    nn('Riolering: staat en leeftijd'),
                    nn('Elektra: keuring en vervanging nodig'),
                    nn('Verwarming: onderhoud en vervanging'),
                    nn('Vochtbehandeling: maatregelen nodig'),
                    nn('Houtrotreparatie: locaties en urgentie'),
                    nn('Restauratie-elementen: specificatie vereist'),
                    n('Kosten korte termijn (0–2 jaar)', '€'),
                    n('Kosten middellange termijn (2–6 jaar)', '€'),
                    n('Kosten lange termijn (6–12 jaar)', '€'),
                    c('SIM-subsidie: aanvraag voorbereid'),
                    c('Monumentenvergunning: nodig voor werkzaamheden')
                ]
            }
        ];
    }

    // =====================================================
    // EVENT BINDINGS
    // =====================================================
    bindEvents() {
        // Language switcher
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setLanguage(btn.dataset.lang));
        });

        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.closest('.nav-btn').dataset.tab));
        });

        // Project Form
        document.getElementById('save-project').addEventListener('click', () => this.saveProject());
        document.getElementById('project-form').addEventListener('input', () => this.autoSaveProject());

        // Import modal (bidirectional connectors: ERPNext + n8n)
        document.getElementById('import-modal-close').addEventListener('click', () => this.closeImportModal());
        document.querySelector('#import-modal .modal-overlay').addEventListener('click', () => this.closeImportModal());
        document.getElementById('import-cancel').addEventListener('click', () => this.closeImportModal());
        document.getElementById('import-confirm').addEventListener('click', () => this.confirmImport());

        // Publish modal (Woningborg / AFAS / Exact / webhook)
        document.getElementById('wb-modal-close').addEventListener('click', () => this.closePublishModal());
        document.querySelector('#wb-modal .modal-overlay').addEventListener('click', () => this.closePublishModal());
        document.getElementById('wb-cancel').addEventListener('click', () => this.closePublishModal());
        document.getElementById('wb-send').addEventListener('click', () => this.publishToWoningborg());
        document.getElementById('wb-connector').addEventListener('change', (e) => this._applyConnectorToModal(e.target.value));

        // BAG address lookup
        document.getElementById('bag-lookup-btn').addEventListener('click', () => this.openBagModal());
        // EP-Online energielabel lookup (via RVO API)
        document.getElementById('epol-lookup-btn').addEventListener('click', () => this.lookupEnergyLabel());
        // Import project data from a configured bidirectional connector (ERPNext / n8n)
        document.getElementById('project-import-btn').addEventListener('click', () => this.openProjectImport());
        // Linked-ERP badge: click = save the project file to the linked ERP project now
        document.getElementById('erp-link-badge').addEventListener('click', () => this.syncProjectToLinked(true));
        document.getElementById('bag-modal-close').addEventListener('click', () => this.closeBagModal());
        document.querySelector('#bag-modal .modal-overlay').addEventListener('click', () => this.closeBagModal());
        document.getElementById('bag-cancel').addEventListener('click', () => this.closeBagModal());
        document.getElementById('bag-search').addEventListener('click', () => this.searchBag());
        document.getElementById('bag-apikey-save').addEventListener('click', () => this.saveBagApiKey());
        ['bag-postcode-input','bag-huisnr-input','bag-toev-input'].forEach(id => {
            document.getElementById(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.searchBag(); } });
        });

        // Contacts
        document.getElementById('add-contact-btn').addEventListener('click', () => this.openContactModal());
        document.getElementById('save-contact').addEventListener('click', () => this.saveContact());
        document.getElementById('cancel-contact').addEventListener('click', () => this.closeContactModal());
        document.getElementById('delete-contact').addEventListener('click', () => this.deleteContact());
        document.getElementById('contact-modal-close').addEventListener('click', () => this.closeContactModal());
        document.querySelector('#contact-modal .modal-overlay').addEventListener('click', () => this.closeContactModal());

        // IFC / 3D BIM tab
        const ifcZone = document.getElementById('ifc-upload');
        const ifcInput = document.getElementById('ifc-input');
        if (ifcZone && ifcInput) {
            ifcZone.addEventListener('click', () => ifcInput.click());
            ifcZone.addEventListener('dragover', (e) => { e.preventDefault(); ifcZone.classList.add('dragover'); });
            ifcZone.addEventListener('dragleave', () => ifcZone.classList.remove('dragover'));
            ifcZone.addEventListener('drop', (e) => { e.preventDefault(); ifcZone.classList.remove('dragover'); if (e.dataTransfer.files[0]) this.loadIfcFile(e.dataTransfer.files[0]); });
            ifcInput.addEventListener('change', (e) => { if (e.target.files[0]) this.loadIfcFile(e.target.files[0]); e.target.value = ''; });
        }

        // Floor Plan Upload
        const uploadZone = document.getElementById('floor-plan-upload');
        const uploadInput = document.getElementById('floor-plan-input');
        uploadZone.addEventListener('click', () => uploadInput.click());
        uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
        uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
        uploadZone.addEventListener('drop', (e) => { e.preventDefault(); uploadZone.classList.remove('dragover'); this.processFloorPlanFiles(e.dataTransfer.files); });
        uploadInput.addEventListener('change', (e) => { this.processFloorPlanFiles(e.target.files); e.target.value = ''; });

        // Floor Plan Selection & Filters
        document.getElementById('active-floor').addEventListener('change', (e) => this.setActiveFloorPlan(e.target.value));
        document.getElementById('filter-status').addEventListener('change', () => this.renderPointsList());
        document.getElementById('filter-category').addEventListener('change', () => this.renderPointsList());
        document.getElementById('filter-priority').addEventListener('change', () => this.renderPointsList());

        // Canvas Tools
        document.getElementById('add-point-btn').addEventListener('click', () => this.toggleAddPointMode());
        document.getElementById('zoom-in-btn').addEventListener('click', () => this.zoom(0.25));
        document.getElementById('zoom-out-btn').addEventListener('click', () => this.zoom(-0.25));
        document.getElementById('zoom-fit-btn').addEventListener('click', () => this.zoomFit());
        document.getElementById('floor-plan-wrapper').addEventListener('click', (e) => this.handleCanvasClick(e));

        // Ticket Modal
        document.getElementById('modal-close').addEventListener('click', () => this.closePointModal());
        document.getElementById('cancel-point').addEventListener('click', () => this.closePointModal());
        document.getElementById('save-point').addEventListener('click', () => this.savePoint());
        document.getElementById('delete-point').addEventListener('click', () => this.deletePoint());
        document.querySelector('#point-modal .modal-overlay').addEventListener('click', () => this.closePointModal());
        document.getElementById('add-comment-btn').addEventListener('click', () => this.addComment());
        document.getElementById('new-comment').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.addComment(); });

        // Photo Upload
        const photoUpload = document.getElementById('photo-upload');
        const photoInput = document.getElementById('photo-input');
        photoUpload.addEventListener('click', () => photoInput.click());
        photoUpload.addEventListener('dragover', (e) => { e.preventDefault(); photoUpload.classList.add('dragover'); });
        photoUpload.addEventListener('dragleave', () => photoUpload.classList.remove('dragover'));
        photoUpload.addEventListener('drop', (e) => { e.preventDefault(); photoUpload.classList.remove('dragover'); this.processPhotoFiles(e.dataTransfer.files); });
        photoInput.addEventListener('change', (e) => { this.processPhotoFiles(e.target.files); e.target.value = ''; });

        // Camera
        document.getElementById('camera-btn').addEventListener('click', () => this.openCamera());
        document.getElementById('camera-capture').addEventListener('click', () => this.capturePhoto());
        document.getElementById('camera-cancel').addEventListener('click', () => this.closeCamera());
        document.getElementById('camera-modal-close').addEventListener('click', () => this.closeCamera());
        document.getElementById('camera-switch').addEventListener('click', () => this.switchCamera());
        document.querySelector('#camera-modal .modal-overlay').addEventListener('click', () => this.closeCamera());

        // Photo Viewer
        document.getElementById('photo-viewer-close').addEventListener('click', () => this.closePhotoViewer());
        document.getElementById('photo-prev').addEventListener('click', () => this.navigatePhoto(-1));
        document.getElementById('photo-next').addEventListener('click', () => this.navigatePhoto(1));
        document.querySelector('#photo-viewer-modal .modal-overlay').addEventListener('click', () => this.closePhotoViewer());

        // Inspectie
        document.getElementById('new-inspection-btn').addEventListener('click', () => this.showInspectionSetup());
        document.getElementById('cancel-inspection-setup').addEventListener('click', () => this.showInspectionOverview());
        document.getElementById('start-inspection-btn').addEventListener('click', () => this.startInspection());
        document.getElementById('back-to-inspections').addEventListener('click', () => this.showInspectionOverview());
        document.getElementById('back-to-inspections-bottom').addEventListener('click', () => this.showInspectionOverview());
        document.getElementById('edit-insp-info-btn').addEventListener('click', () => this.toggleEditInspInfo());
        document.getElementById('save-insp-info-btn').addEventListener('click', () => this.saveInspInfo());
        document.getElementById('finish-inspection-btn').addEventListener('click', () => this.showSignature());
        document.getElementById('clear-signature').addEventListener('click', () => this.clearSignatureCanvas());
        document.getElementById('cancel-sign').addEventListener('click', () => this.showInspectionExecution());
        document.getElementById('confirm-sign').addEventListener('click', () => this.signInspection());

        // Oplevering
        document.getElementById('new-handover-btn').addEventListener('click', () => this.showHandoverSetup());
        document.getElementById('cancel-handover-setup').addEventListener('click', () => this.showHandoverOverview());
        document.getElementById('add-ho-participant').addEventListener('click', () => this.addHandoverParticipant());
        document.getElementById('start-handover-btn').addEventListener('click', () => this.startHandover());
        document.getElementById('back-to-handovers').addEventListener('click', () => this.showHandoverOverview());
        document.getElementById('finish-handover-btn').addEventListener('click', () => this.showHandoverSign());
        document.getElementById('add-ho-signature').addEventListener('click', () => this.addHandoverSignatureBlock());
        document.getElementById('cancel-ho-sign').addEventListener('click', () => this.showHandoverExecution());
        document.getElementById('confirm-ho-sign').addEventListener('click', () => this.signHandover());

        // Handover documents
        const hoDocUpload = document.getElementById('ho-doc-upload');
        const hoDocInput = document.getElementById('ho-doc-input');
        hoDocUpload.addEventListener('click', () => hoDocInput.click());
        hoDocInput.addEventListener('change', (e) => { this.processHandoverDocs(e.target.files); e.target.value = ''; });

        // Export
        document.getElementById('export-html').addEventListener('click', () => this.exportHTML());
        document.getElementById('export-pdf').addEventListener('click', () => this.exportPDF());
        document.getElementById('export-bcf').addEventListener('click', () => this.exportBCF());
        document.getElementById('sync-kyp').addEventListener('click', () => this.openPublishModal(null, 'kyp'));
        document.getElementById('save-json').addEventListener('click', () => this.saveJSON());
        document.getElementById('load-json').addEventListener('click', () => {
            if (window.__tauriDialog && window.__tauriFs) { this.loadJSONTauri(); }
            else { document.getElementById('load-json-input').click(); }
        });
        document.getElementById('load-json-input').addEventListener('change', (e) => this.loadJSON(e));
        document.getElementById('clear-data').addEventListener('click', () => this.clearLocalStorage());

        // Export type radio
        document.querySelectorAll('input[name="export-type"]').forEach(r => {
            r.addEventListener('change', () => this.updateExportTypeUI());
        });

        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closePointModal(); this.closePhotoViewer(); this.closeContactModal();
                this.isAddingPoint = false;
                document.getElementById('add-point-btn')?.classList.remove('active');
            }
        });
    }

    // =====================================================
    // TAB NAVIGATION
    // =====================================================
    switchTab(tabName) {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');
        if (tabName === 'export') this.updateExportSummary();
        if (tabName === 'koppelingen') this.renderConnectorsList();
        if (tabName === 'dashboard') this.updateDashboard();
        if (tabName === 'inspectie') this.renderInspectionsList();
        if (tabName === 'oplevering') this.renderHandoversList();
    }

    // =====================================================
    // PROJECT & CONTACTS
    // =====================================================
    setDefaultDate() {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('survey-date').value = today;
        document.getElementById('insp-date').value = today;
        document.getElementById('ho-date').value = today;
    }

    saveProject(showConfirmation = true) {
        const prevBag = this.project?.bagData || null;
        const prevEnergy = this.project?.energyLabel || null;
        const prevErpRef = this.project?.erpRef || null;
        this.project = {
            name: document.getElementById('project-name').value, number: document.getElementById('project-number').value,
            client: document.getElementById('client-name').value, contactPerson: document.getElementById('contact-person').value,
            address: document.getElementById('street-address').value, postalCode: document.getElementById('postal-code').value,
            city: document.getElementById('city').value, surveyDate: document.getElementById('survey-date').value,
            surveyor: document.getElementById('surveyor').value, description: document.getElementById('project-description').value,
            notes: document.getElementById('project-notes').value,
            bagData: prevBag,
            energyLabel: prevEnergy,
            erpRef: prevErpRef
        };
        this.saveToLocalStorage();
        if (showConfirmation) this.saveJSON();
        // Auto-sync to the linked ERP project on explicit saves only — autosave (typing)
        // stays local so we don't hammer the ERP on every keystroke.
        if (showConfirmation && this.project.erpRef) this.syncProjectToLinked(false);
    }

    autoSaveProject() { clearTimeout(this._ast); this._ast = setTimeout(() => this.saveProject(false), 2000); }

    loadProjectForm() {
        const p = this.project;
        document.getElementById('project-name').value = p.name || '';
        document.getElementById('project-number').value = p.number || '';
        document.getElementById('client-name').value = p.client || '';
        document.getElementById('contact-person').value = p.contactPerson || '';
        document.getElementById('street-address').value = p.address || '';
        document.getElementById('postal-code').value = p.postalCode || '';
        document.getElementById('city').value = p.city || '';
        document.getElementById('survey-date').value = p.surveyDate || '';
        document.getElementById('surveyor').value = p.surveyor || '';
        document.getElementById('project-description').value = p.description || '';
        document.getElementById('project-notes').value = p.notes || '';
        this.refreshBagBadge();
        this.refreshProjectImportBtn();
        this.refreshErpLinkBadge();
    }

    // =====================================================
    // BAG (Basisregistratie Adressen en Gebouwen) LOOKUP
    // =====================================================
    getBagApiKey() { return localStorage.getItem('ofs_bag_api_key') || ''; }
    saveBagApiKey() {
        const val = document.getElementById('bag-apikey-input').value.trim();
        if (!val) return;
        localStorage.setItem('ofs_bag_api_key', val);
        this.setBagStatus(this.t('bag_key_saved'), 'success');
    }

    refreshBagBadge() {
        const badge = document.getElementById('bag-verified-badge');
        const text = document.getElementById('bag-verified-text');
        if (!badge) return;
        const b = this.project?.bagData;
        if (b && b.nummeraanduidingId) {
            badge.style.display = 'inline-flex';
            text.textContent = this.tFormat('bag_verified_id', b.nummeraanduidingId);
            badge.title = `Pand: ${b.pandId || '?'} · Verblijfsobject: ${b.adresseerbaarObjectId || '?'}`;
        } else {
            badge.style.display = 'none';
        }
        // Show energy-label lookup button only when we have an addressable object ID to query with.
        const epolBtn = document.getElementById('epol-lookup-btn');
        if (epolBtn) epolBtn.style.display = (b && b.adresseerbaarObjectId) ? 'inline-flex' : 'none';
        this.refreshEnergyBadge();
    }

    refreshEnergyBadge() {
        const el = document.getElementById('epol-badge');
        if (!el) return;
        const e = this.project?.energyLabel;
        if (!e || !e.label) { el.style.display = 'none'; return; }
        const colors = { 'A+++++':'#00A651','A++++':'#00A651','A+++':'#00A651','A++':'#00A651','A+':'#00A651',
                         'A':'#4CB847','B':'#84C441','C':'#E8DA00','D':'#FFCB00','E':'#FF9A00','F':'#F26522','G':'#EB1E1E' };
        el.style.display = 'inline-block';
        el.style.background = colors[e.label] || '#666';
        el.textContent = this.tFormat('epol_badge', e.label);
        el.title = `EP-online: ${e.label}${e.opnamedatum ? ' · ' + e.opnamedatum : ''}${e.geldigTot ? ' · geldig tot ' + e.geldigTot : ''}`;
    }

    async lookupEnergyLabel() {
        const b = this.project?.bagData;
        if (!b?.adresseerbaarObjectId) { this.showNotification(this.t('epol_no_bag'), 'error'); return; }
        let key = localStorage.getItem('ofs_epol_api_key') || '';
        if (!key) {
            key = prompt(this.t('epol_ask_key') + '\n\nhttps://public.ep-online.nl/');
            if (!key) return;
            localStorage.setItem('ofs_epol_api_key', key.trim());
            key = key.trim();
        }
        const url = `https://public.ep-online.nl/api/v5/PandEnergielabel/AdresseerbaarObject/${encodeURIComponent(b.adresseerbaarObjectId)}`;
        try {
            const res = await this._netFetch(url, {
                headers: {
                    'Authorization': key,
                    'Accept': 'application/json'
                }
            });
            if (res.status === 401 || res.status === 403) { this.showNotification(this.t('epol_bad_key'), 'error'); return; }
            if (res.status === 404) { this.showNotification(this.t('epol_none_found'), 'error'); return; }
            if (!res.ok) { this.showNotification(`EP-Online HTTP ${res.status}`, 'error'); return; }
            const items = await res.json();
            const rec = Array.isArray(items) ? items[0] : items;
            if (!rec) { this.showNotification(this.t('epol_none_found'), 'error'); return; }
            this.project.energyLabel = {
                label: rec.labelLetter || rec.energielabel || rec.definitiefEnergielabel || null,
                indexScore: rec.energieindex || rec.energiePrestatie || null,
                opnamedatum: rec.opnameDatum || rec.registratiedatum || null,
                geldigTot: rec.geldigTot || null,
                source: 'ep-online-v5',
                verifiedAt: new Date().toISOString()
            };
            this.saveToLocalStorage();
            this.refreshEnergyBadge();
            this.logActivity(this.tFormat('act_epol_ok', this.project.energyLabel.label || '?'));
            this.showNotification(this.tFormat('epol_ok', this.project.energyLabel.label || '?'), 'success');
        } catch (err) {
            this.showNotification(this.tFormat('epol_network', err.message || err), 'error');
        }
    }

    openBagModal() {
        // Prefill from existing project fields
        document.getElementById('bag-postcode-input').value = (this.project.postalCode || '').replace(/\s+/g, '').toUpperCase();
        const parsed = this.parseHuisnummer(this.project.address || '');
        document.getElementById('bag-huisnr-input').value = parsed.nummer || '';
        document.getElementById('bag-toev-input').value = parsed.toevoeging || '';
        document.getElementById('bag-apikey-input').value = this.getBagApiKey();
        document.getElementById('bag-results').innerHTML = '';
        this.setBagStatus('', '');
        document.getElementById('bag-modal').classList.add('active');
        setTimeout(() => document.getElementById('bag-postcode-input').focus(), 50);
    }
    closeBagModal() { document.getElementById('bag-modal').classList.remove('active'); }

    parseHuisnummer(address) {
        // Extract huisnummer and toevoeging from a free-text address string.
        // Handles: "Hoofdstraat 123", "Hoofdstraat 12A", "Hoofdstraat 12-3", "Hoofdstraat 12 bis".
        const m = (address || '').match(/(\d+)\s*([a-zA-Z]{0,4}|-\d+)?\b/);
        if (!m) return { nummer: '', toevoeging: '' };
        return { nummer: m[1], toevoeging: (m[2] || '').replace(/^-/, '') };
    }

    setBagStatus(msg, kind) {
        const el = document.getElementById('bag-status');
        if (!el) return;
        el.textContent = msg || '';
        el.style.color = kind === 'error' ? 'var(--danger, #dc2626)'
                       : kind === 'success' ? 'var(--success, #059669)'
                       : 'var(--text-muted, #6b7280)';
    }

    async searchBag() {
        const apiKey = this.getBagApiKey();
        if (!apiKey) {
            this.setBagStatus(this.t('bag_need_key'), 'error');
            // Open the details section so the user can paste a key.
            document.querySelector('#bag-modal details').open = true;
            document.getElementById('bag-apikey-input').focus();
            return;
        }
        const postcode = document.getElementById('bag-postcode-input').value.trim().replace(/\s+/g, '').toUpperCase();
        const huisnummer = document.getElementById('bag-huisnr-input').value.trim();
        const toev = document.getElementById('bag-toev-input').value.trim();
        if (!/^\d{4}[A-Z]{2}$/.test(postcode)) { this.setBagStatus(this.t('bag_bad_postcode'), 'error'); return; }
        if (!/^\d+$/.test(huisnummer)) { this.setBagStatus(this.t('bag_bad_huisnr'), 'error'); return; }

        const params = new URLSearchParams({ postcode, huisnummer });
        // Huisletter is a single letter; if user typed multiple chars they probably mean huisnummertoevoeging.
        if (/^[a-zA-Z]$/.test(toev)) params.set('huisletter', toev.toUpperCase());
        else if (toev) params.set('huisnummertoevoeging', toev);
        params.set('exacteMatch', 'true');

        const url = `https://api.bag.kadaster.nl/lvbag/individuelebevragingen/v2/adressen?${params.toString()}`;
        this.setBagStatus(this.t('bag_searching'), '');
        document.getElementById('bag-results').innerHTML = '';
        try {
            const res = await this._netFetch(url, {
                headers: {
                    'X-Api-Key': apiKey,
                    'Accept': 'application/hal+json',
                    'Accept-Crs': 'epsg:28992'
                }
            });
            if (res.status === 401 || res.status === 403) { this.setBagStatus(this.t('bag_bad_key'), 'error'); return; }
            if (res.status === 404) { this.setBagStatus(this.t('bag_no_results'), 'error'); return; }
            if (res.status === 429) { this.setBagStatus(this.t('bag_rate_limited'), 'error'); return; }
            if (!res.ok) { this.setBagStatus(`HTTP ${res.status}`, 'error'); return; }
            const data = await res.json();
            const items = (data && data._embedded && data._embedded.adressen) || [];
            if (!items.length) { this.setBagStatus(this.t('bag_no_results'), 'error'); return; }
            this.renderBagResults(items);
            this.setBagStatus(this.tFormat('bag_found_n', items.length), 'success');
        } catch (err) {
            console.error('BAG error', err);
            this.setBagStatus(this.tFormat('bag_network_error', err.message || err), 'error');
        }
    }

    renderBagResults(items) {
        const list = document.getElementById('bag-results');
        list.innerHTML = items.map((a, i) => {
            const straat = a.openbareRuimteNaam || '';
            const nr = a.huisnummer || '';
            const letter = a.huisletter || '';
            const toev = a.huisnummertoevoeging || '';
            const nrFull = `${nr}${letter}${toev ? '-' + toev : ''}`;
            const plaats = a.woonplaatsNaam || '';
            const pc = a.postcode || '';
            return `
                <div class="contact-card" style="cursor:pointer;padding:0.6rem 0.8rem;" data-bag-idx="${i}">
                    <div class="contact-card-info">
                        <h4 style="margin:0;">${this.esc(straat)} ${this.esc(nrFull)}</h4>
                        <p style="margin:0;font-size:0.85rem;">${this.esc(pc)} ${this.esc(plaats)}</p>
                    </div>
                </div>`;
        }).join('');
        list.querySelectorAll('[data-bag-idx]').forEach(el => {
            el.addEventListener('click', () => this.applyBagResult(items[parseInt(el.dataset.bagIdx, 10)]));
        });
    }

    applyBagResult(a) {
        const straat = a.openbareRuimteNaam || '';
        const nr = a.huisnummer || '';
        const letter = a.huisletter || '';
        const toev = a.huisnummertoevoeging || '';
        const nrFull = `${nr}${letter}${toev ? '-' + toev : ''}`;
        document.getElementById('street-address').value = `${straat} ${nrFull}`.trim();
        document.getElementById('postal-code').value = a.postcode || '';
        document.getElementById('city').value = a.woonplaatsNaam || '';
        this.project.bagData = {
            nummeraanduidingId: a.nummeraanduidingIdentificatie || null,
            adresseerbaarObjectId: a.adresseerbaarObjectIdentificatie || null,
            pandId: (a.pandIdentificaties && a.pandIdentificaties[0]) || null,
            openbareRuimteNaam: straat,
            huisnummer: nr,
            huisletter: letter || null,
            huisnummertoevoeging: toev || null,
            postcode: a.postcode || '',
            woonplaatsNaam: a.woonplaatsNaam || '',
            verifiedAt: new Date().toISOString()
        };
        this.saveProject(false);
        this.refreshBagBadge();
        this.closeBagModal();
        this.logActivity(this.tFormat('act_bag_applied', straat, nrFull));
    }

    // Contacts
    renderContacts() {
        const c = document.getElementById('contacts-list');
        if (!this.contacts.length) { c.innerHTML = `<p class="empty-state" style="padding:1rem;">${this.t('empty_contacts')}</p>`; return; }
        c.innerHTML = this.contacts.map(ct => `
            <div class="contact-card" onclick="app.openContactModal('${ct.id}')">
                <div class="contact-avatar">${(ct.name||'?')[0].toUpperCase()}</div>
                <div class="contact-card-info">
                    <h4>${this.esc(ct.name)}</h4>
                    <p>${this.esc(ct.role)} ${ct.company ? '- '+this.esc(ct.company) : ''}</p>
                </div>
            </div>
        `).join('');
        this.updateAssigneeDropdowns();
    }

    openContactModal(id = null) {
        const modal = document.getElementById('contact-modal');
        const title = document.getElementById('contact-modal-title');
        const delBtn = document.getElementById('delete-contact');
        if (id) {
            const ct = this.contacts.find(c => c.id === id);
            if (!ct) return;
            title.textContent = this.t('contact_edit');
            document.getElementById('contact-id-input').value = ct.id;
            document.getElementById('contact-name-input').value = ct.name;
            document.getElementById('contact-role-input').value = ct.role;
            document.getElementById('contact-company-input').value = ct.company || '';
            document.getElementById('contact-email-input').value = ct.email || '';
            document.getElementById('contact-phone-input').value = ct.phone || '';
            delBtn.style.display = 'block';
        } else {
            title.textContent = this.t('contact_add');
            document.getElementById('contact-id-input').value = '';
            document.getElementById('contact-name-input').value = '';
            document.getElementById('contact-role-input').value = 'Uitvoerder'; // value is key, not display
            document.getElementById('contact-company-input').value = '';
            document.getElementById('contact-email-input').value = '';
            document.getElementById('contact-phone-input').value = '';
            delBtn.style.display = 'none';
        }
        modal.classList.add('active');
    }

    closeContactModal() { document.getElementById('contact-modal').classList.remove('active'); }

    saveContact() {
        const name = document.getElementById('contact-name-input').value.trim();
        if (!name) { this.showNotification(this.t('msg_fill_name'), 'error'); return; }
        const id = document.getElementById('contact-id-input').value || this.genId();
        const ct = { id, name, role: document.getElementById('contact-role-input').value,
            company: document.getElementById('contact-company-input').value,
            email: document.getElementById('contact-email-input').value,
            phone: document.getElementById('contact-phone-input').value };
        const idx = this.contacts.findIndex(c => c.id === id);
        if (idx !== -1) this.contacts[idx] = ct; else this.contacts.push(ct);
        this.renderContacts(); this.saveToLocalStorage(); this.closeContactModal();
        this.showNotification(this.t('msg_contact_saved'), 'success');
    }

    async deleteContact() {
        const id = document.getElementById('contact-id-input').value;
        if (!id) return;
        const ok = await this.asyncConfirm(this.t('msg_confirm_delete'));
        if (ok) {
            this.contacts = this.contacts.filter(c => c.id !== id);
            this.renderContacts(); this.saveToLocalStorage(); this.closeContactModal();
        }
    }

    updateAssigneeDropdowns() {
        const opts = `<option value="">${this.t('ph_nobody')}</option>` + this.contacts.map(c => `<option value="${c.name}">${this.esc(c.name)} (${c.role})</option>`).join('');
        document.getElementById('point-assigned').innerHTML = opts;
    }

    // =====================================================
    // FLOOR PLAN MANAGEMENT
    // =====================================================
    processFloorPlanFiles(files) {
        Array.from(files).forEach(file => {
            if (file.type.startsWith('image/')) {
                const r = new FileReader();
                r.onload = (e) => { this.floorPlans.push({ id:this.genId(), name:file.name.replace(/\.[^/.]+$/,''), data:e.target.result, type:file.type }); this.renderFloorPlansList(); this.updateFloorPlanSelector(); this.saveToLocalStorage(); };
                r.readAsDataURL(file);
            } else if (file.type === 'application/pdf') this.processPDFFile(file);
        });
    }

    async processPDFFile(file) {
        try {
            this.showNotification(this.t('msg_pdf_processing'), 'info');
            pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
            const ab = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const vp = page.getViewport({ scale: 2 });
                const canvas = document.createElement('canvas');
                canvas.width = vp.width; canvas.height = vp.height;
                await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
                const bn = file.name.replace(/\.[^/.]+$/,'');
                this.floorPlans.push({ id:this.genId(), name: pdf.numPages > 1 ? `${bn} - Pagina ${i}` : bn, data:canvas.toDataURL('image/png'), type:'image/png', originalType:'application/pdf' });
            }
            this.renderFloorPlansList(); this.updateFloorPlanSelector(); this.saveToLocalStorage();
            this.showNotification(`PDF: ${pdf.numPages} ${this.t('msg_pdf_done')}`, 'success');
        } catch(e) { console.error(e); this.showNotification(this.t('msg_pdf_error'), 'error'); }
    }

    renderFloorPlansList() {
        // Validate data-URL and escape name — floorPlans may come from external connectors that
        // could inject HTML via unsanitized `fp.name` (alt=) or attribute-breakout in `fp.data` (src=).
        const isSafeDataUrl = (s) => typeof s === 'string' && /^data:[a-z0-9]+\/[a-z0-9+.\-]+;base64,[A-Za-z0-9+/=]+$/.test(s);
        document.getElementById('floor-plans-list').innerHTML = this.floorPlans.map(fp => {
            const safeSrc = isSafeDataUrl(fp.data) ? fp.data : '';
            const safeAlt = this.esc(fp.name || '');
            return `
            <div class="floor-plan-card"><div class="floor-plan-thumbnail-wrapper"><img src="${safeSrc}" alt="${safeAlt}" class="floor-plan-thumbnail">${fp.originalType === 'application/pdf' ? '<span class="pdf-badge">PDF</span>' : ''}</div>
            <div class="floor-plan-info"><input type="text" value="${this.esc(fp.name)}" onchange="app.updateFloorPlanName('${fp.id}', this.value)">
            <div class="floor-plan-actions"><button class="select-btn" onclick="app.selectFloorPlan('${fp.id}')">${this.t('btn_select')}</button><button class="delete-btn" onclick="app.deleteFloorPlan('${fp.id}')">${this.t('btn_delete')}</button></div></div></div>
        `;
        }).join('');
    }

    updateFloorPlanSelector() {
        const base = `<option value="">${this.t('ph_select_plan')}</option>` + this.floorPlans.map(fp => `<option value="${fp.id}">${this.esc(fp.name)}</option>`).join('');
        document.getElementById('active-floor').innerHTML = base;
        document.getElementById('insp-floor').innerHTML = `<option value="">${this.t('ph_floor')}</option>` + this.floorPlans.map(fp => `<option value="${fp.id}">${this.esc(fp.name)}</option>`).join('');
        if (this.activeFloorPlanId && this.floorPlans.find(fp => fp.id === this.activeFloorPlanId)) document.getElementById('active-floor').value = this.activeFloorPlanId;
    }

    updateFloorPlanName(id, name) { const fp = this.floorPlans.find(f => f.id === id); if (fp) { fp.name = name; this.updateFloorPlanSelector(); this.saveToLocalStorage(); } }
    async deleteFloorPlan(id) {
        const ok = await this.asyncConfirm(this.t('msg_confirm_delete_plan'));
        if (!ok) return;
        this.floorPlans = this.floorPlans.filter(fp => fp.id !== id);
        this.tickets = this.tickets.filter(t => t.floorPlanId !== id);
        if (this.activeFloorPlanId === id) { this.activeFloorPlanId = null; this.clearCanvas(); }
        this.renderFloorPlansList(); this.updateFloorPlanSelector(); this.renderPointsList(); this.saveToLocalStorage();
    }
    selectFloorPlan(id) { this.switchTab('opname'); document.getElementById('active-floor').value = id; this.setActiveFloorPlan(id); }

    setActiveFloorPlan(id) {
        this.activeFloorPlanId = id;
        const fp = this.floorPlans.find(f => f.id === id);
        if (fp) {
            const img = document.getElementById('floor-plan-image');
            img.src = fp.data;
            document.getElementById('floor-plan-wrapper').style.display = 'inline-block';
            document.getElementById('canvas-placeholder').style.display = 'none';
            img.onload = () => this.renderLocationPoints();
            this.renderLocationPoints(); this.renderPointsList();
        } else this.clearCanvas();
    }

    clearCanvas() {
        document.getElementById('floor-plan-image').src = '';
        document.getElementById('floor-plan-wrapper').style.display = 'none';
        document.getElementById('canvas-placeholder').style.display = 'block';
        document.getElementById('location-points').innerHTML = '';
        this.renderPointsList();
    }

    // =====================================================
    // TICKET MANAGEMENT
    // =====================================================
    toggleAddPointMode() {
        this.isAddingPoint = !this.isAddingPoint;
        document.getElementById('add-point-btn').classList.toggle('active', this.isAddingPoint);
        document.getElementById('floor-plan-wrapper').classList.toggle('adding-point', this.isAddingPoint);
    }

    handleCanvasClick(e) {
        if (!this.isAddingPoint || !this.activeFloorPlanId || e.target.closest('.location-point')) return;
        const img = document.getElementById('floor-plan-image');
        const r = img.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * 100;
        const y = ((e.clientY - r.top) / r.height) * 100;
        if (x >= 0 && x <= 100 && y >= 0 && y <= 100) { this.openPointModal(null, x, y); this.toggleAddPointMode(); }
    }

    openPointModal(pointId = null, x = 0, y = 0) {
        const modal = document.getElementById('point-modal');
        const title = document.getElementById('modal-title');
        const delBtn = document.getElementById('delete-point');
        const commentsSection = document.getElementById('comments-section');
        this.currentPhotos = [];

        if (pointId) {
            const t = this.tickets.find(p => p.id === pointId);
            if (!t) return;
            title.textContent = this.t('ticket_edit');
            document.getElementById('point-id').value = t.id;
            document.getElementById('point-label').value = t.label;
            document.getElementById('point-description').value = t.description || '';
            document.getElementById('point-category').value = t.category || 'Bouwkundig';
            document.getElementById('point-priority').value = t.priority || 'medium';
            document.getElementById('point-severity').value = t.severity || 'cosmetic';
            document.getElementById('point-status').value = t.status || 'open';
            document.getElementById('point-assigned').value = t.assignedTo || '';
            document.getElementById('point-deadline').value = t.deadline || '';
            document.getElementById('point-x').value = t.x;
            document.getElementById('point-y').value = t.y;
            this.currentPhotos = [...(t.photos || [])];
            delBtn.style.display = 'block';
            this.editingPointId = pointId;
            commentsSection.style.display = 'block';
            this.renderComments(t.comments || []);
        } else {
            title.textContent = this.t('ticket_add');
            document.getElementById('point-id').value = '';
            document.getElementById('point-label').value = '';
            document.getElementById('point-description').value = '';
            document.getElementById('point-category').value = 'Bouwkundig';
            document.getElementById('point-priority').value = 'medium';
            document.getElementById('point-severity').value = 'cosmetic';
            document.getElementById('point-status').value = 'open';
            document.getElementById('point-assigned').value = '';
            document.getElementById('point-deadline').value = '';
            document.getElementById('point-x').value = x;
            document.getElementById('point-y').value = y;
            delBtn.style.display = 'none';
            this.editingPointId = null;
            commentsSection.style.display = 'none';
        }
        this.renderPhotoPreview();
        modal.classList.add('active');
        document.getElementById('point-label').focus();
    }

    closePointModal() { document.getElementById('point-modal').classList.remove('active'); this.currentPhotos = []; this.editingPointId = null; }

    savePoint() {
        const label = document.getElementById('point-label').value.trim();
        if (!label) { this.showNotification(this.t('msg_fill_label'), 'error'); return; }
        const existingTicket = this.editingPointId ? this.tickets.find(t => t.id === this.editingPointId) : null;
        const td = {
            id: document.getElementById('point-id').value || this.genId(),
            floorPlanId: this.activeFloorPlanId, label,
            description: document.getElementById('point-description').value,
            category: document.getElementById('point-category').value,
            priority: document.getElementById('point-priority').value,
            severity: document.getElementById('point-severity').value,
            status: document.getElementById('point-status').value,
            assignedTo: document.getElementById('point-assigned').value,
            deadline: document.getElementById('point-deadline').value,
            x: parseFloat(document.getElementById('point-x').value),
            y: parseFloat(document.getElementById('point-y').value),
            photos: [...this.currentPhotos],
            comments: existingTicket ? existingTicket.comments || [] : [],
            history: existingTicket ? existingTicket.history || [] : [],
            createdAt: existingTicket ? existingTicket.createdAt : new Date().toISOString()
        };
        if (this.editingPointId) {
            const idx = this.tickets.findIndex(p => p.id === this.editingPointId);
            if (idx !== -1) { td.history.push({ action:'Bewerkt', date:new Date().toISOString() }); this.tickets[idx] = td; }
        } else {
            td.history.push({ action:'Aangemaakt', date:new Date().toISOString() });
            this.tickets.push(td);
        }
        this.logActivity(this.editingPointId ? this.tFormat('log_ticket_edited', label) : this.tFormat('log_ticket_created', label));
        this.renderLocationPoints(); this.renderPointsList(); this.saveToLocalStorage(); this.closePointModal();
        this.showNotification(this.t('msg_ticket_saved'), 'success');
    }

    async deletePoint() {
        if (!this.editingPointId) return;
        const ok = await this.asyncConfirm(this.t('msg_confirm_delete'));
        if (ok) {
            const t = this.tickets.find(p => p.id === this.editingPointId);
            this.tickets = this.tickets.filter(p => p.id !== this.editingPointId);
            this.logActivity(this.tFormat('log_ticket_deleted', t?.label || ''));
            this.renderLocationPoints(); this.renderPointsList(); this.saveToLocalStorage(); this.closePointModal();
        }
    }

    addComment() {
        if (!this.editingPointId) return;
        const input = document.getElementById('new-comment');
        const text = input.value.trim();
        if (!text) return;
        const t = this.tickets.find(p => p.id === this.editingPointId);
        if (!t) return;
        if (!t.comments) t.comments = [];
        t.comments.push({ text, date: new Date().toISOString(), author: this.project.surveyor || this.t('lbl_surveyor') });
        input.value = '';
        this.renderComments(t.comments);
        this.saveToLocalStorage();
    }

    renderComments(comments) {
        const c = document.getElementById('comments-list');
        c.innerHTML = comments.map(cm => `
            <div class="comment-item"><div class="comment-meta">${this.esc(cm.author)} - ${new Date(cm.date).toLocaleString('en-GB')}</div>${this.esc(cm.text)}</div>
        `).join('');
    }

    renderLocationPoints() {
        const container = document.getElementById('location-points');
        const pts = this.tickets.filter(p => p.floorPlanId === this.activeFloorPlanId);
        const colors = { open:'#D97706', assigned:'#2563EB', completed:'#16A34A', verified:'#71717A', archived:'#A1A1AA' };
        container.innerHTML = pts.map((p, i) => `
            <div class="location-point" style="left:${p.x}%;top:${p.y}%;" onclick="app.openPointModal('${p.id}')" title="${this.esc(p.label)}">
                <svg viewBox="0 0 24 24" fill="${colors[p.status]||'#D97706'}"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                <span class="point-label">${i + 1}</span>
            </div>
        `).join('');
    }

    renderPointsList() {
        const container = document.getElementById('points-list');
        const fStatus = document.getElementById('filter-status').value;
        const fCat = document.getElementById('filter-category').value;
        const fPri = document.getElementById('filter-priority').value;
        let pts = this.tickets.filter(p => p.floorPlanId === this.activeFloorPlanId);
        if (fStatus) pts = pts.filter(p => p.status === fStatus);
        if (fCat) pts = pts.filter(p => p.category === fCat);
        if (fPri) pts = pts.filter(p => p.priority === fPri);
        const tc = document.getElementById('ticket-count'); if (tc) tc.textContent = pts.length;
        if (!pts.length) { container.innerHTML = `<p class="empty-state">${this.t('empty_filtered')}</p>`; return; }
        container.innerHTML = pts.map((p, i) => `
            <div class="point-item priority-${p.priority||'medium'}" onclick="app.openPointModal('${p.id}')">
                <div class="point-item-icon">${i + 1}</div>
                <div class="point-item-info"><h4>${this.esc(p.label)}</h4><p>${p.category||''} · ${p.photos?.length||0} ${this.t('lbl_photos')}${p.assignedTo ? ' · '+this.esc(p.assignedTo) : ''}</p></div>
                <span class="status-badge status-${p.status||'open'}">${this.statusLabel(p.status)}</span>
            </div>
        `).join('');
    }

    populateCategoryFilter() {
        document.getElementById('filter-category').innerHTML = `<option value="">${this.t('filter_all_cat')}</option>` + CATEGORY_VALUES.map((c, i) => `<option value="${c}">${this.t(CATEGORY_KEYS[i])}</option>`).join('');
    }

    // =====================================================
    // PHOTO MANAGEMENT
    // =====================================================

    // Geolocation with a 5-minute cache to avoid pinging on every photo.
    async getCurrentGPS() {
        const cached = this._gpsCache;
        const now = Date.now();
        if (cached && (now - cached.at) < 5 * 60 * 1000) return cached.gps;
        if (!navigator.geolocation) return null;
        return new Promise(resolve => {
            const t = setTimeout(() => resolve(null), 6000);
            navigator.geolocation.getCurrentPosition(
                pos => {
                    clearTimeout(t);
                    const gps = {
                        lat: +pos.coords.latitude.toFixed(6),
                        lon: +pos.coords.longitude.toFixed(6),
                        accuracy: Math.round(pos.coords.accuracy || 0)
                    };
                    this._gpsCache = { at: now, gps };
                    resolve(gps);
                },
                () => { clearTimeout(t); resolve(null); },
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
            );
        });
    }

    // Build a photo object with evidentiary metadata (timestamp always, GPS best-effort).
    async buildPhoto(data, name, source) {
        const gps = await this.getCurrentGPS();
        return {
            id: this.genId(),
            data, name,
            capturedAt: new Date().toISOString(),
            source: source || 'file',
            gps: gps || null
        };
    }

    processPhotoFiles(files) {
        Array.from(files).forEach(file => {
            if (!file.type.startsWith('image/')) return;
            const r = new FileReader();
            r.onload = async (e) => {
                const photo = await this.buildPhoto(e.target.result, file.name, 'file');
                this.currentPhotos.push(photo);
                this.renderPhotoPreview();
            };
            r.readAsDataURL(file);
        });
    }
    renderPhotoPreview() {
        document.getElementById('photo-preview').innerHTML = this.currentPhotos.map(p => `
            <div class="photo-thumb"><img src="${p.data}" alt="${p.name}" onclick="app.viewPhoto('${p.id}')"><button class="remove-photo" onclick="event.stopPropagation();app.removePhoto('${p.id}')">&times;</button></div>
        `).join('');
    }
    removePhoto(id) { this.currentPhotos = this.currentPhotos.filter(p => p.id !== id); this.renderPhotoPreview(); }
    viewPhoto(id) { const i = this.currentPhotos.findIndex(p => p.id === id); if (i !== -1) { this.currentPhotoIndex = i; this.showPhotoViewer(); } }
    showPhotoViewer() {
        const p = this.currentPhotos[this.currentPhotoIndex];
        if (!p) return;
        document.getElementById('photo-viewer-image').src = p.data;
        document.getElementById('photo-viewer-caption').textContent = `${this.currentPhotoIndex+1} / ${this.currentPhotos.length}`;
        const meta = document.getElementById('photo-viewer-meta');
        if (meta) meta.innerHTML = this.formatPhotoMeta(p);
        document.getElementById('photo-viewer-modal').classList.add('active');
    }

    formatPhotoMeta(p) {
        if (!p) return '';
        const parts = [];
        if (p.capturedAt) {
            const d = new Date(p.capturedAt);
            const stamp = isNaN(d.getTime()) ? '' : d.toLocaleString();
            if (stamp) parts.push(`${this.t('photo_taken_at')}: ${this.esc(stamp)}`);
        }
        if (p.gps) {
            const { lat, lon, accuracy } = p.gps;
            const mapUrl = `https://www.google.com/maps?q=${lat},${lon}`;
            parts.push(`GPS: <a href="${mapUrl}" target="_blank" rel="noopener" style="color:#fbbf24;text-decoration:underline;">${lat.toFixed(6)}, ${lon.toFixed(6)}</a> (±${accuracy}m)`);
        } else if (p.capturedAt) {
            parts.push(this.t('photo_no_gps'));
        }
        if (!parts.length) parts.push(this.t('photo_meta_unknown'));
        return parts.join(' · ');
    }
    closePhotoViewer() { document.getElementById('photo-viewer-modal').classList.remove('active'); }
    navigatePhoto(d) { this.currentPhotoIndex = (this.currentPhotoIndex + d + this.currentPhotos.length) % this.currentPhotos.length; this.showPhotoViewer(); }

    // =====================================================
    // CAMERA
    // =====================================================
    async openCamera() {
        const isApp = !!window.__TAURI_INTERNALS__;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.showNotification('Camera niet beschikbaar. Gebruik HTTPS of open via bestandskeuze.', 'error');
            document.getElementById('photo-input')?.click();
            return;
        }
        this._cameraFacingMode = 'environment';
        try {
            if (navigator.permissions) {
                try {
                    const perm = await navigator.permissions.query({ name: 'camera' });
                    if (perm.state === 'denied') {
                        if (isApp) {
                            this.showNotification('Camera geblokkeerd. Ga naar Android Instellingen > Apps > Field Workspace > Rechten > Camera > Toestaan.', 'error');
                        } else {
                            this.showNotification('Camera geblokkeerd. Ga naar browser-instellingen > Site-instellingen > Camera > Toestaan, en herlaad de pagina.', 'error');
                        }
                        return;
                    }
                } catch (_) { /* permissions API not supported for camera, continue */ }
            }
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: this._cameraFacingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false
            });
            this._cameraStream = stream;
            const video = document.getElementById('camera-video');
            video.srcObject = stream;
            document.getElementById('camera-modal').classList.add('active');
        } catch (e) {
            console.error('Camera error:', e);
            if (e.name === 'NotAllowedError') {
                if (isApp) {
                    this.showNotification('Camera-toegang geweigerd. Ga naar Android Instellingen > Apps > Field Workspace > Rechten > Camera > Toestaan.', 'error');
                } else {
                    this.showNotification('Camera-toegang geweigerd. Tik op het slot-icoon in de adresbalk > Camera > Toestaan, en herlaad de pagina.', 'error');
                }
            } else if (e.name === 'NotFoundError') {
                this.showNotification('Geen camera gevonden op dit apparaat.', 'error');
            } else {
                this.showNotification(this.t('msg_camera_error'), 'error');
            }
        }
    }

    async capturePhoto() {
        if (this._itemPhotoIdx !== undefined) { this.captureItemPhoto(); this.closeCamera(); return; }
        const video = document.getElementById('camera-video');
        const canvas = document.getElementById('camera-canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const name = `foto_${new Date().toISOString().slice(11,19).replace(/:/g,'')}.jpg`;
        const photo = await this.buildPhoto(dataUrl, name, 'camera');
        this.currentPhotos.push(photo);
        this.renderPhotoPreview();
        this.showNotification(this.t('msg_photo_captured'), 'success');
    }

    async switchCamera() {
        this.closeCamera(true);
        this._cameraFacingMode = this._cameraFacingMode === 'environment' ? 'user' : 'environment';
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: this._cameraFacingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false
            });
            this._cameraStream = stream;
            document.getElementById('camera-video').srcObject = stream;
            document.getElementById('camera-modal').classList.add('active');
        } catch (e) {
            this.showNotification(this.t('msg_camera_switch_fail'), 'error');
        }
    }

    closeCamera(keepModal = false) {
        if (this._cameraStream) {
            this._cameraStream.getTracks().forEach(t => t.stop());
            this._cameraStream = null;
        }
        if (!keepModal) document.getElementById('camera-modal').classList.remove('active');
    }

    // =====================================================
    // ZOOM
    // =====================================================
    zoom(d) { this.zoomLevel = Math.max(0.25, Math.min(4, this.zoomLevel + d)); document.getElementById('floor-plan-image').style.transform = `scale(${this.zoomLevel})`; }
    zoomFit() { this.zoomLevel = 1; document.getElementById('floor-plan-image').style.transform = 'scale(1)'; }

    // =====================================================
    // INSPECTIE MODULE
    // =====================================================
    showInspectionOverview() {
        document.getElementById('inspectie-overview').style.display = 'block';
        document.getElementById('inspectie-setup').style.display = 'none';
        document.getElementById('inspectie-execute').style.display = 'none';
        document.getElementById('inspectie-sign').style.display = 'none';
        this.renderInspectionsList();
    }

    showInspectionSetup() {
        document.getElementById('inspectie-overview').style.display = 'none';
        document.getElementById('inspectie-setup').style.display = 'block';
        document.getElementById('insp-template').innerHTML = `<option value="">${this.t('ph_template')}</option>` +
            this.checklistTemplates.map(t => `<option value="${t.id}">${this.esc(t.name)}</option>`).join('');
        document.getElementById('insp-inspector').value = this.project.surveyor || '';
    }

    showInspectionExecution() {
        document.getElementById('inspectie-setup').style.display = 'none';
        document.getElementById('inspectie-execute').style.display = 'block';
        document.getElementById('inspectie-sign').style.display = 'none';
        document.getElementById('insp-edit-info').style.display = 'none';
    }

    toggleEditInspInfo() {
        const panel = document.getElementById('insp-edit-info');
        const insp = this.inspections.find(i => i.id === this.currentInspectionId);
        if (!insp) return;
        if (panel.style.display === 'none') {
            document.getElementById('insp-edit-name').value = insp.name || '';
            document.getElementById('insp-edit-inspector').value = insp.inspector || '';
            document.getElementById('insp-edit-date').value = insp.date || '';
            const floorSelect = document.getElementById('insp-edit-floor');
            floorSelect.innerHTML = '<option value="">-- Optioneel --</option>' +
                this.floorPlans.map(fp => `<option value="${fp.id}" ${fp.id === insp.floorPlanId ? 'selected' : ''}>${this.esc(fp.name)}</option>`).join('');
            panel.style.display = 'grid';
        } else {
            panel.style.display = 'none';
        }
    }

    saveInspInfo() {
        const insp = this.inspections.find(i => i.id === this.currentInspectionId);
        if (!insp) return;
        const name = document.getElementById('insp-edit-name').value.trim();
        if (!name) { this.showNotification(this.t('msg_fill_name'), 'error'); return; }
        insp.name = name;
        insp.inspector = document.getElementById('insp-edit-inspector').value;
        insp.date = document.getElementById('insp-edit-date').value;
        insp.floorPlanId = document.getElementById('insp-edit-floor').value || null;
        document.getElementById('insp-exec-title').textContent = insp.name;
        document.getElementById('insp-edit-info').style.display = 'none';
        this.saveToLocalStorage();
        this.showNotification(this.t('msg_saved'), 'success');
    }

    startInspection() {
        const name = document.getElementById('insp-name').value.trim();
        if (!name) { this.showNotification(this.t('msg_fill_name'), 'error'); return; }
        const type = document.getElementById('insp-type').value;
        const templateId = document.getElementById('insp-template').value;
        const template = this.checklistTemplates.find(t => t.id === templateId);
        const isNEN = template && template.scoring === 'nen2767';
        const items = type === 'checklist' && template ? template.items.map((item, i) => {
            const isObj = typeof item === 'object';
            const itemType = isObj ? item.type : (isNEN ? 'nen2767' : 'check');
            return {
                id: `item_${i}`,
                question: isObj ? item.q : item,
                type: itemType,
                options: isObj ? (item.options || null) : null,
                unit: isObj ? (item.unit || null) : null,
                result: '', score: null, value: '', notes: '', photos: []
            };
        }) : [{ id: 'item_0', question: 'Vrije observatie', type: 'check', options: null, unit: null, result: '', score: null, value: '', notes: '', photos: [] }];

        const insp = {
            id: this.genId(), name, type, templateId: templateId || null,
            scoring: isNEN ? 'nen2767' : null,
            date: document.getElementById('insp-date').value, inspector: document.getElementById('insp-inspector').value,
            floorPlanId: document.getElementById('insp-floor').value || null,
            status: 'in_progress', items, signature: null, notes: ''
        };
        this.inspections.push(insp);
        this.currentInspectionId = insp.id;
        this.logActivity(this.tFormat('log_insp_started', name));
        this.saveToLocalStorage();
        this.renderChecklistExecution();
        this.showInspectionExecution();
    }

    renderChecklistExecution() {
        const insp = this.inspections.find(i => i.id === this.currentInspectionId);
        if (!insp) return;
        document.getElementById('insp-exec-title').textContent = insp.name;
        document.getElementById('insp-notes').value = insp.notes || '';
        const container = document.getElementById('checklist-items');
        container.innerHTML = insp.items.map((item, idx) => {
            const type = item.type || 'check';
            const hasRightActions = type === 'check' || type === 'nen2767';
            return `
            <div class="checklist-item" data-idx="${idx}" data-type="${type}">
                <div style="flex:1">
                    <div class="checklist-item-question">${this.esc(item.question)}</div>
                    ${this.renderItemInput(item, idx)}
                    <div class="checklist-item-detail">
                        <textarea rows="1" placeholder="Notitie..." onchange="app.updateChecklistItem(${idx},'notes',this.value)">${this.esc(item.notes || '')}</textarea>
                    </div>
                </div>
                ${hasRightActions ? `
                <div class="checklist-item-actions ${type === 'nen2767' ? 'nen-scores' : ''}">
                    ${type === 'nen2767'
                        ? [1,2,3,4,5,6].map(sc => `<button class="checklist-btn nen-score nen-score-${sc} ${item.score==sc?'selected':''}" onclick="app.updateChecklistItem(${idx},'score',${sc})" title="${this.getNENLabel(sc)}">${sc}</button>`).join('')
                        : `<button class="checklist-btn pass ${item.result==='pass'?'selected':''}" onclick="app.updateChecklistItem(${idx},'result','pass')" title="Goed">&#10003;</button>
                           <button class="checklist-btn fail ${item.result==='fail'?'selected':''}" onclick="app.updateChecklistItem(${idx},'result','fail')" title="Fout">&#10007;</button>
                           <button class="checklist-btn na ${item.result==='na'?'selected':''}" onclick="app.updateChecklistItem(${idx},'result','na')" title="N.v.t.">-</button>`
                    }
                </div>` : ''}
            </div>`;
        }).join('');
        this.updateInspectionProgress();
    }

    renderItemInput(item, idx) {
        const type = item.type || 'check';
        switch (type) {
            case 'select': {
                const opts = item.options || [];
                const val = item.value || '';
                return `<div class="checklist-choices">${opts.map(opt =>
                    `<button type="button" class="checklist-choice ${val === opt ? 'selected' : ''}" onclick="app.selectChoice(${idx},'${opt.replace(/'/g,"\\'")}')">${this.esc(opt)}</button>`
                ).join('')}</div>`;
            }
            case 'multi': {
                const opts = item.options || [];
                const sel = (item.value || '').split(',').map(s => s.trim()).filter(Boolean);
                return `<div class="checklist-choices">${opts.map(opt =>
                    `<button type="button" class="checklist-choice ${sel.includes(opt) ? 'selected' : ''}" onclick="app.toggleMultiChoice(${idx},'${opt.replace(/'/g,"\\'")}')">${this.esc(opt)}</button>`
                ).join('')}</div>`;
            }
            case 'number': {
                const unit = item.unit || '';
                return `<div class="checklist-number-input">
                    <input type="number" step="any" value="${this.esc(item.value||'')}" placeholder="0" oninput="app.updateChecklistValue(${idx},this.value)">
                    ${unit ? `<span class="checklist-unit">${this.esc(unit)}</span>` : ''}
                </div>`;
            }
            case 'text': {
                return `<div class="checklist-text-input">
                    <input type="text" value="${this.esc(item.value||'')}" placeholder="..." oninput="app.updateChecklistValue(${idx},this.value)">
                </div>`;
            }
            case 'photo':
                return this.renderPhotoInput(item, idx);
            case 'check':
            case 'nen2767':
            default:
                return '';
        }
    }

    selectChoice(idx, option) {
        const insp = this.inspections.find(i => i.id === this.currentInspectionId);
        if (!insp) return;
        const item = insp.items[idx];
        item.value = item.value === option ? '' : option;
        this.saveToLocalStorage();
        this.renderChecklistExecution();
    }

    toggleMultiChoice(idx, option) {
        const insp = this.inspections.find(i => i.id === this.currentInspectionId);
        if (!insp) return;
        const item = insp.items[idx];
        let sel = (item.value || '').split(',').map(s => s.trim()).filter(Boolean);
        if (sel.includes(option)) sel = sel.filter(s => s !== option);
        else sel.push(option);
        item.value = sel.join(', ');
        this.saveToLocalStorage();
        this.renderChecklistExecution();
    }

    updateChecklistValue(idx, value) {
        const insp = this.inspections.find(i => i.id === this.currentInspectionId);
        if (!insp) return;
        insp.items[idx].value = value;
        this.saveToLocalStorage();
    }

    renderPhotoInput(item, idx) {
        const photos = item.photos || [];
        return `<div class="checklist-photo-input">
            <div class="checklist-photo-thumbs">${photos.map((p, pi) => `
                <div class="checklist-photo-thumb">
                    <img src="${p.data}" alt="${this.esc(p.name)}" onclick="app.viewItemPhoto(${idx},${pi})">
                    <button class="remove-photo" onclick="event.stopPropagation();app.removeItemPhoto(${idx},${pi})">&times;</button>
                </div>`).join('')}</div>
            <div class="checklist-photo-actions">
                <button type="button" class="btn btn-sm btn-secondary" onclick="app.openItemCamera(${idx})">&#128247; Foto</button>
                <label class="btn btn-sm btn-secondary" style="cursor:pointer">&#128206; Upload<input type="file" accept="image/*" multiple hidden onchange="app.uploadItemPhotos(${idx},this.files);this.value='';"></label>
            </div>
        </div>`;
    }

    async openItemCamera(idx) {
        this._itemPhotoIdx = idx;
        await this.openCamera();
    }

    async captureItemPhoto() {
        const video = document.getElementById('camera-video');
        const canvas = document.getElementById('camera-canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const insp = this.inspections.find(i => i.id === this.currentInspectionId);
        if (insp && this._itemPhotoIdx !== undefined) {
            const item = insp.items[this._itemPhotoIdx];
            if (!item.photos) item.photos = [];
            const name = `foto_${new Date().toISOString().slice(11,19).replace(/:/g,'')}.jpg`;
            const photo = await this.buildPhoto(dataUrl, name, 'camera');
            item.photos.push(photo);
            this.saveToLocalStorage();
            this.renderChecklistExecution();
            this.showNotification(this.t('msg_photo_captured'), 'success');
        }
        this._itemPhotoIdx = undefined;
    }

    uploadItemPhotos(idx, files) {
        const insp = this.inspections.find(i => i.id === this.currentInspectionId);
        if (!insp) return;
        const item = insp.items[idx];
        if (!item.photos) item.photos = [];
        Array.from(files).forEach(file => {
            if (!file.type.startsWith('image/')) return;
            const r = new FileReader();
            r.onload = async (e) => {
                const photo = await this.buildPhoto(e.target.result, file.name, 'file');
                item.photos.push(photo);
                this.saveToLocalStorage();
                this.renderChecklistExecution();
            };
            r.readAsDataURL(file);
        });
    }

    removeItemPhoto(idx, photoIdx) {
        const insp = this.inspections.find(i => i.id === this.currentInspectionId);
        if (!insp) return;
        insp.items[idx].photos.splice(photoIdx, 1);
        this.saveToLocalStorage();
        this.renderChecklistExecution();
    }

    viewItemPhoto(idx, photoIdx) {
        const insp = this.inspections.find(i => i.id === this.currentInspectionId);
        if (!insp) return;
        const photo = insp.items[idx].photos[photoIdx];
        if (photo) {
            document.getElementById('photo-viewer-image').src = photo.data;
            document.getElementById('photo-viewer-modal').classList.add('active');
        }
    }

    getNENLabel(score) {
        return {1:this.t('nen_1'),2:this.t('nen_2'),3:this.t('nen_3'),4:this.t('nen_4'),5:this.t('nen_5'),6:this.t('nen_6')}[score] || '';
    }

    updateChecklistItem(idx, field, value) {
        const insp = this.inspections.find(i => i.id === this.currentInspectionId);
        if (!insp) return;
        insp.items[idx][field] = value;
        if (field === 'result' || field === 'score') this.renderChecklistExecution();
        this.saveToLocalStorage();
    }

    updateInspectionProgress() {
        const insp = this.inspections.find(i => i.id === this.currentInspectionId);
        if (!insp) return;
        const done = this.countDoneItems(insp.items);
        const total = insp.items.length;
        let extra = '';
        const nenScored = insp.items.filter(i => i.type === 'nen2767' && i.score);
        if (nenScored.length > 0) {
            const avg = (nenScored.reduce((a, b) => a + b.score, 0) / nenScored.length).toFixed(1);
            extra = ` · ${this.t('nen_avg')} ${avg} (${this.getNENLabel(Math.round(avg))})`;
        }
        document.getElementById('insp-progress-text').textContent = `${done} / ${total}${extra}`;
        document.getElementById('insp-progress-bar').style.width = total ? `${(done/total)*100}%` : '0%';
    }

    showSignature() {
        const insp = this.inspections.find(i => i.id === this.currentInspectionId);
        if (!insp) return;
        insp.notes = document.getElementById('insp-notes').value;
        // Create tickets for failed items
        insp.items.filter(i => i.result === 'fail').forEach(item => {
            const prefix = `[${this.t('nav_inspectie')}] `;
            const exists = this.tickets.some(t => t.label === `${prefix}${item.question}` && t.floorPlanId === insp.floorPlanId);
            if (!exists && insp.floorPlanId) {
                this.tickets.push({
                    id: this.genId(), floorPlanId: insp.floorPlanId, label: `${prefix}${item.question}`,
                    description: `${this.t('insp_rejected')} - ${insp.name}\n${item.notes||''}`,
                    category: 'Bouwkundig', priority: 'medium', severity: 'functional', status: 'open',
                    assignedTo: '', deadline: '', x: 50, y: 50, photos: [], comments: [], history: [{ action:'Aangemaakt vanuit inspectie', date:new Date().toISOString() }],
                    createdAt: new Date().toISOString()
                });
            }
        });
        this.saveToLocalStorage();
        document.getElementById('inspectie-execute').style.display = 'none';
        document.getElementById('inspectie-sign').style.display = 'block';
        document.getElementById('sign-name').value = insp.inspector || '';
        this.initSignatureCanvas('signature-canvas');
    }

    initSignatureCanvas(canvasId) {
        const canvas = document.getElementById(canvasId);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let drawing = false;
        const getPos = (e) => {
            const r = canvas.getBoundingClientRect();
            const t = e.touches ? e.touches[0] : e;
            return { x: (t.clientX - r.left) * (canvas.width / r.width), y: (t.clientY - r.top) * (canvas.height / r.height) };
        };
        const start = (e) => { e.preventDefault(); drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
        const move = (e) => { if (!drawing) return; e.preventDefault(); const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.strokeStyle = '#36363E'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke(); };
        const end = () => { drawing = false; };
        canvas.onmousedown = start; canvas.onmousemove = move; canvas.onmouseup = end; canvas.onmouseleave = end;
        canvas.ontouchstart = start; canvas.ontouchmove = move; canvas.ontouchend = end;
    }

    clearSignatureCanvas() { const c = document.getElementById('signature-canvas'); c.getContext('2d').clearRect(0, 0, c.width, c.height); }

    signInspection() {
        const insp = this.inspections.find(i => i.id === this.currentInspectionId);
        if (!insp) return;
        const name = document.getElementById('sign-name').value.trim();
        if (!name) { this.showNotification(this.t('msg_fill_name'), 'error'); return; }
        insp.signature = { name, date: new Date().toISOString(), data: document.getElementById('signature-canvas').toDataURL() };
        insp.status = 'signed';
        this.logActivity(this.tFormat('log_insp_signed', insp.name, name));
        this.saveToLocalStorage();
        this.showNotification(this.t('msg_insp_signed'), 'success');
        this.showInspectionOverview();
    }

    countDoneItems(items) {
        let done = 0;
        items.forEach(item => {
            const type = item.type || 'check';
            switch (type) {
                case 'check':    if (item.result) done++; break;
                case 'nen2767': if (item.score)  done++; break;
                case 'photo':   if (item.photos && item.photos.length > 0) done++; break;
                default:        if (item.value)  done++; break;
            }
        });
        return done;
    }

    renderInspectionsList() {
        const c = document.getElementById('inspections-list');
        if (!this.inspections.length) { c.innerHTML = `<p class="empty-state">${this.t('empty_inspections')}</p>`; return; }
        c.innerHTML = this.inspections.map(insp => {
            const isNEN = insp.scoring === 'nen2767';
            const done = this.countDoneItems(insp.items);
            const fail = insp.items.filter(i => i.result === 'fail').length;
            let extra = '';
            if (isNEN && done > 0) {
                const avg = (insp.items.filter(i => i.score).map(i => i.score).reduce((a,b)=>a+b,0) / done).toFixed(1);
                extra = ` · ${this.t('nen_score')}: ${avg}`;
            } else if (fail) {
                extra = ` · ${fail} ${this.t('insp_rejected')}`;
            }
            const catLabel = insp.scoring === 'nen2767' ? ' · NEN 2767' : '';
            return `<div class="inspection-card" onclick="app.viewInspection('${insp.id}')">
                <div class="inspection-card-info"><h4>${this.esc(insp.name)}</h4><p>${insp.date} · ${insp.inspector||''}${catLabel} · ${done}/${insp.items.length} items${extra}</p></div>
                <span class="status-badge status-${insp.status==='signed'?'verified':'assigned'}">${insp.status==='signed'?this.t('insp_signed'):this.t('insp_in_progress')}</span>
            </div>`;
        }).join('');
    }

    viewInspection(id) {
        this.currentInspectionId = id;
        const insp = this.inspections.find(i => i.id === id);
        if (!insp) return;
        if (insp.status === 'signed') {
            this.renderChecklistExecution();
            document.getElementById('inspectie-overview').style.display = 'none';
            document.getElementById('inspectie-execute').style.display = 'block';
            document.getElementById('finish-inspection-btn').style.display = 'none';
        } else {
            this.renderChecklistExecution();
            this.showInspectionExecution();
            document.getElementById('inspectie-overview').style.display = 'none';
            document.getElementById('finish-inspection-btn').style.display = '';
        }
    }

    // =====================================================
    // OPLEVERING MODULE
    // =====================================================
    showHandoverOverview() {
        document.getElementById('oplevering-overview').style.display = 'block';
        document.getElementById('oplevering-setup').style.display = 'none';
        document.getElementById('oplevering-execute').style.display = 'none';
        document.getElementById('oplevering-sign').style.display = 'none';
        this.renderHandoversList();
    }

    showHandoverSetup() {
        document.getElementById('oplevering-overview').style.display = 'none';
        document.getElementById('oplevering-setup').style.display = 'block';
        document.getElementById('ho-participants').innerHTML = '';
        this.addHandoverParticipant();
    }

    showHandoverExecution() {
        document.getElementById('oplevering-setup').style.display = 'none';
        document.getElementById('oplevering-execute').style.display = 'block';
        document.getElementById('oplevering-sign').style.display = 'none';
    }

    showHandoverSign() {
        document.getElementById('oplevering-execute').style.display = 'none';
        document.getElementById('oplevering-sign').style.display = 'block';
        document.getElementById('ho-signatures-area').innerHTML = '';
        const ho = this.handovers.find(h => h.id === this.currentHandoverId);
        if (ho && ho.participants) {
            ho.participants.forEach(p => this.addHandoverSignatureBlock(p.name, p.role));
        }
    }

    addHandoverParticipant() {
        const c = document.getElementById('ho-participants');
        const div = document.createElement('div');
        div.className = 'ho-participant-row';
        div.innerHTML = `<input type="text" placeholder="${this.t('ph_contact_name')}"><select><option value="Opdrachtgever">${this.t('role_opdrachtgever')}</option><option value="Aannemer">${this.t('role_aannemer')}</option><option value="Projectleider">${this.t('role_projectleider')}</option><option value="Inspecteur">${this.t('role_inspecteur')}</option><option value="Overig">${this.t('role_overig')}</option></select><input type="text" placeholder="${this.t('ph_contact_company')}"><button class="remove-btn" onclick="(window.app?window.app.asyncConfirm(window.app.t('msg_confirm_delete')):Promise.resolve(true)).then(ok=>{if(ok)this.parentElement.remove()})">&times;</button>`;
        c.appendChild(div);
    }

    startHandover() {
        const type = document.getElementById('ho-type').value;
        const date = document.getElementById('ho-date').value;
        const notes = document.getElementById('ho-notes').value;
        const participantRows = document.querySelectorAll('#ho-participants .ho-participant-row');
        const participants = Array.from(participantRows).map(row => ({
            name: row.querySelector('input:first-child').value,
            role: row.querySelector('select').value,
            company: row.querySelectorAll('input')[1].value
        })).filter(p => p.name);

        const openTickets = this.tickets.filter(t => t.status !== 'verified' && t.status !== 'archived');
        const ho = {
            id: this.genId(), type, date, status: 'in_progress', participants, notes,
            items: openTickets.map(t => ({ ticketId: t.id, verdict: '', notes: '' })),
            signatures: [], verdict: '', documents: []
        };
        this.handovers.push(ho);
        this.currentHandoverId = ho.id;
        this.logActivity(this.tFormat('log_ho_started', this.hoTypeLabel(type)));
        this.saveToLocalStorage();
        this.renderHandoverExecution();
        this.showHandoverExecution();
    }

    renderHandoverExecution() {
        const ho = this.handovers.find(h => h.id === this.currentHandoverId);
        if (!ho) return;
        document.getElementById('ho-exec-title').textContent = this.hoTypeLabel(ho.type) || 'Oplevering';
        const c = document.getElementById('ho-items-list');
        if (!ho.items.length) { c.innerHTML = `<p class="empty-state">${this.t('empty_ho_items')}</p>`; return; }
        c.innerHTML = ho.items.map((item, idx) => {
            const t = this.tickets.find(tk => tk.id === item.ticketId);
            if (!t) return '';
            return `<div class="ho-item">
                <div class="ho-item-info"><h4>${this.esc(t.label)}</h4><p>${t.category||''} · ${this.priorityLabel(t.priority)} · ${this.severityLabel(t.severity)}</p></div>
                <div class="ho-item-verdict">
                    <button class="verdict-btn approved ${item.verdict==='approved'?'selected':''}" onclick="app.setHandoverVerdict(${idx},'approved')">&#10003;</button>
                    <button class="verdict-btn conditional ${item.verdict==='conditional'?'selected':''}" onclick="app.setHandoverVerdict(${idx},'conditional')">&#9888;</button>
                    <button class="verdict-btn rejected ${item.verdict==='rejected'?'selected':''}" onclick="app.setHandoverVerdict(${idx},'rejected')">&#10007;</button>
                </div>
            </div>`;
        }).join('');
        this.updateHandoverProgress();
        this.renderHandoverDocs();
    }

    setHandoverVerdict(idx, verdict) {
        const ho = this.handovers.find(h => h.id === this.currentHandoverId);
        if (!ho) return;
        ho.items[idx].verdict = ho.items[idx].verdict === verdict ? '' : verdict;
        this.saveToLocalStorage();
        this.renderHandoverExecution();
    }

    updateHandoverProgress() {
        const ho = this.handovers.find(h => h.id === this.currentHandoverId);
        if (!ho) return;
        const done = ho.items.filter(i => i.verdict).length;
        document.getElementById('ho-progress-text').textContent = `${done} / ${ho.items.length} ${this.t('ho_assessed')}`;
        document.getElementById('ho-progress-bar').style.width = ho.items.length ? `${(done/ho.items.length)*100}%` : '0%';
    }

    processHandoverDocs(files) {
        const ho = this.handovers.find(h => h.id === this.currentHandoverId);
        if (!ho) return;
        Array.from(files).forEach(file => {
            const r = new FileReader();
            r.onload = (e) => {
                ho.documents.push({ id: this.genId(), name: file.name, data: e.target.result, category: 'document' });
                this.saveToLocalStorage(); this.renderHandoverDocs();
            };
            r.readAsDataURL(file);
        });
    }

    renderHandoverDocs() {
        const ho = this.handovers.find(h => h.id === this.currentHandoverId);
        if (!ho) return;
        document.getElementById('ho-documents-list').innerHTML = ho.documents.map(d => `
            <div class="ho-doc-item"><span>${this.esc(d.name)}</span><button onclick="app.removeHandoverDoc('${d.id}')">&times;</button></div>
        `).join('');
    }

    async removeHandoverDoc(docId) { const ok = await this.asyncConfirm(this.t('msg_confirm_delete')); if (!ok) return;
        const ho = this.handovers.find(h => h.id === this.currentHandoverId);
        if (ho) { ho.documents = ho.documents.filter(d => d.id !== docId); this.saveToLocalStorage(); this.renderHandoverDocs(); }
    }

    addHandoverSignatureBlock(name = '', role = '') {
        const area = document.getElementById('ho-signatures-area');
        const idx = area.children.length;
        const div = document.createElement('div');
        div.className = 'ho-signature-block';
        div.innerHTML = `<label>Naam</label><input type="text" class="ho-sig-name" value="${this.esc(name)}" placeholder="Volledige naam">
            <label>Rol</label><input type="text" class="ho-sig-role" value="${this.esc(role)}" placeholder="Rol">
            <label>Handtekening</label><canvas class="ho-sig-canvas" width="400" height="150"></canvas>
            <button class="btn btn-secondary" onclick="this.previousElementSibling.getContext('2d').clearRect(0,0,400,150)" style="margin-top:0.5rem;padding:4px 12px;font-size:0.8rem;">Wissen</button>`;
        area.appendChild(div);
        this.initSignatureCanvas2(div.querySelector('canvas'));
    }

    initSignatureCanvas2(canvas) {
        const ctx = canvas.getContext('2d');
        let drawing = false;
        const getPos = (e) => { const r = canvas.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x:(t.clientX-r.left)*(canvas.width/r.width), y:(t.clientY-r.top)*(canvas.height/r.height) }; };
        const start = (e) => { e.preventDefault(); drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
        const move = (e) => { if (!drawing) return; e.preventDefault(); const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.strokeStyle='#36363E'; ctx.lineWidth=2; ctx.lineCap='round'; ctx.stroke(); };
        const end = () => { drawing = false; };
        canvas.onmousedown = start; canvas.onmousemove = move; canvas.onmouseup = end; canvas.onmouseleave = end;
        canvas.ontouchstart = start; canvas.ontouchmove = move; canvas.ontouchend = end;
    }

    signHandover() {
        const ho = this.handovers.find(h => h.id === this.currentHandoverId);
        if (!ho) return;
        ho.verdict = document.getElementById('ho-verdict').value;
        const blocks = document.querySelectorAll('#ho-signatures-area .ho-signature-block');
        ho.signatures = Array.from(blocks).map(b => ({
            name: b.querySelector('.ho-sig-name').value,
            role: b.querySelector('.ho-sig-role').value,
            date: new Date().toISOString(),
            data: b.querySelector('canvas').toDataURL()
        }));
        ho.status = 'completed';
        // Update ticket statuses based on verdict
        ho.items.forEach(item => {
            const t = this.tickets.find(tk => tk.id === item.ticketId);
            if (t && item.verdict === 'approved') t.status = 'verified';
        });
        this.logActivity(this.tFormat('log_ho_completed', this.hoTypeLabel(ho.type), ho.verdict === 'approved' ? this.t('verdict_approved') : ho.verdict === 'conditional' ? this.t('verdict_conditional') : this.t('verdict_rejected')));
        this.saveToLocalStorage();
        // A completed handover is a milestone — push the project file to the linked ERP project.
        if (this.project?.erpRef) this.syncProjectToLinked(false);
        this.showNotification(this.t('msg_ho_signed'), 'success');
        this.showHandoverOverview();
    }

    renderHandoversList() {
        const c = document.getElementById('handovers-list');
        if (!this.handovers.length) { c.innerHTML = `<p class="empty-state">${this.t('empty_handovers')}</p>`; return; }
        c.innerHTML = this.handovers.map(ho => {
            const approved = ho.items.filter(i => i.verdict === 'approved').length;
            const isDone = ho.status === 'completed';
            const publishBtn = isDone
                ? `<button class="btn btn-sm btn-secondary" style="margin-left:0.5rem;" onclick="event.stopPropagation();app.openWoningborgModal('${ho.id}')" title="${this.t('wb_tooltip')}">🏛 ${this.t('wb_btn')}</button>`
                : '';
            return `<div class="handover-card" onclick="app.viewHandover('${ho.id}')">
                <div class="handover-card-info"><h4>${this.hoTypeLabel(ho.type)}</h4><p>${ho.date} · ${ho.items.length} ${this.t('sum_tickets')} · ${approved} ${this.t('ho_approved')}</p></div>
                <div style="display:flex;align-items:center;gap:0.5rem;">
                    <span class="status-badge status-${isDone?'verified':'assigned'}">${isDone?this.t('ho_completed'):this.t('ho_in_progress')}</span>
                    ${publishBtn}
                </div>
            </div>`;
        }).join('');
    }

    // =====================================================
    // PUBLISH CONNECTORS — pluggable dossier-publish
    // Registry of destinations for a completed handover (Woningborg WKI, AFAS Profit,
    // Exact Online, generic webhook). Each connector defines its own payload shape and
    // send() call. Config (endpoint + API key) is stored per-connector in localStorage.
    // For Woningborg/AFAS/Exact the payload shapes are pragmatic best-effort until we
    // have a real partner-account/spec — swap the body fields in _build*Payload() then.
    // =====================================================
    _connectorDefs() {
        if (this._connCache) return this._connCache;
        const wb = {
            id: 'wb',
            label: 'Woningborg WKI',
            endpointDefault: 'https://api.woningborg.nl/pvo/v1/dossiers',
            endpointLabel: 'API-endpoint',
            apiKeyLabel: 'API-sleutel',
            infoKey: 'pub_info_wb',
            build: (ho) => this._buildWoningborgPayload(ho),
            send: async (cfg, payload) => this._httpJson(cfg.endpoint, payload, `Bearer ${cfg.apiKey}`)
        };
        const afas = {
            id: 'afas',
            label: 'AFAS Profit',
            endpointDefault: 'https://<klant>.rest.afas.online/profitrestservices/connectors/KnSubject',
            endpointLabel: 'AFAS REST URL',
            apiKeyLabel: 'AppConnector token',
            infoKey: 'pub_info_afas',
            build: (ho) => this._buildAfasPayload(ho),
            send: async (cfg, payload) => this._httpJson(cfg.endpoint, payload, `AfasToken ${cfg.apiKey}`)
        };
        const exact = {
            id: 'exact',
            label: 'Exact Online',
            endpointDefault: 'https://start.exactonline.nl/api/v1/<division>/documents/Documents',
            endpointLabel: 'REST endpoint (met divisie-ID)',
            apiKeyLabel: 'OAuth Bearer-token',
            infoKey: 'pub_info_exact',
            build: (ho) => this._buildExactPayload(ho),
            send: async (cfg, payload) => this._httpJson(cfg.endpoint, payload, `Bearer ${cfg.apiKey}`)
        };
        const swk = {
            id: 'swk',
            label: 'SWK (Stichting Waarborgfonds Koopwoningen)',
            endpointDefault: 'https://api.swk.nl/pvo/v1/dossiers',
            endpointLabel: 'API-endpoint',
            apiKeyLabel: 'API-sleutel',
            infoKey: 'pub_info_swk',
            // Same dossier shape as Woningborg — waarborgfonds-instanties gebruiken vergelijkbaar datamodel.
            build: (ho) => this._buildWoningborgPayload(ho),
            send: async (cfg, payload) => this._httpJson(cfg.endpoint, payload, `Bearer ${cfg.apiKey}`)
        };
        const erpnext = {
            id: 'erpnext',
            label: 'ERPNext (Frappe)',
            endpointDefault: 'https://<klant>.frappe.cloud/api/resource/Project',
            endpointLabel: 'Frappe REST endpoint (Doctype)',
            apiKeyLabel: 'API-key:API-secret (`token`) of OAuth Bearer',
            infoKey: 'pub_info_erpnext',
            build: (ho) => this._buildErpnextPayload(ho),
            // Frappe accepteert 'token <apikey>:<apisecret>' — als er ':' in de sleutel zit prefixen we met 'token', anders 'Bearer' (OAuth2).
            send: async (cfg, payload) => this._httpJson(cfg.endpoint, payload, (cfg.apiKey || '').includes(':') ? `token ${cfg.apiKey}` : `Bearer ${cfg.apiKey}`),
            canImport: true,
            runImport: (cfg) => this._importFromErpnext(cfg),
            shortLabel: 'ERPNext',
            backSync: (cfg, ref, data) => this._erpnextBackSync(cfg, ref, data)
        };
        const bouw7 = {
            id: 'bouw7',
            label: 'Bouw7',
            endpointDefault: 'https://api.bouw7.nl/v1/projects/<project-id>/documents',
            endpointLabel: 'Bouw7 endpoint (met project-ID)',
            apiKeyLabel: 'Bouw7 API-token',
            infoKey: 'pub_info_bouw7',
            build: (ho) => this._buildBouw7Payload(ho),
            send: async (cfg, payload) => this._httpJson(cfg.endpoint, payload, `Bearer ${cfg.apiKey}`)
        };
        const webhook = {
            id: 'webhook',
            label: 'n8n / webhook',
            endpointDefault: 'https://n8n.example.nl/webhook/ofs-dossier',
            endpointLabel: 'Webhook URL',
            apiKeyLabel: 'Header-token (optioneel)',
            infoKey: 'pub_info_webhook',
            build: (ho) => this._buildWoningborgPayload(ho),
            send: async (cfg, payload) => this._httpJson(cfg.endpoint, payload, cfg.apiKey ? `Bearer ${cfg.apiKey}` : null),
            canImport: true,
            // Voor import verwacht n8n een aparte GET-webhook — endpoint kan via de import-key op de config staan, of gedeeld met de publish-URL.
            runImport: (cfg) => this._importFromWebhook(cfg),
            shortLabel: 'n8n',
            backSync: (cfg, ref, data) => this._webhookBackSync(cfg, ref, data)
        };
        // KYP is project-scope: tickets → planningtaken (niet per-oplevering).
        const kyp = {
            id: 'kyp',
            label: 'KYP Project (planning)',
            scope: 'project',
            endpointDefault: 'https://kyp.nl/api/v1/projects/<project-id>/tasks',
            endpointLabel: 'KYP-endpoint (met project-ID)',
            apiKeyLabel: 'KYP API-token',
            infoKey: 'pub_info_kyp',
            build: (_ho) => this._buildKypPayload(),
            send: async (cfg, payload) => this._httpJson(cfg.endpoint, payload, `Bearer ${cfg.apiKey}`)
        };
        this._connCache = { wb, swk, afas, exact, erpnext, bouw7, webhook, kyp };
        return this._connCache;
    }
    _connectorGet(id) { return this._connectorDefs()[id] || this._connectorDefs().wb; }

    // Network fetch for external connector APIs. Inside the Tauri app this routes through
    // the Rust backend (tauri-plugin-http) which is not subject to webview CORS — most ERP
    // APIs (ERPNext/AFAS/Exact) don't send CORS headers. Web build falls back to fetch().
    _netFetch(url, opts) {
        const f = window.__tauriHttpFetch || fetch;
        return f(url, opts);
    }

    async _httpJson(url, payload, authHeader) {
        const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        if (authHeader) headers['Authorization'] = authHeader;
        const res = await this._netFetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
        let bodyRef = '';
        try { const j = await res.json(); bodyRef = j.id || j.dossierId || j.Id || j.ID || ''; } catch (_) {}
        return { ok: res.ok, status: res.status, ref: bodyRef };
    }

    async _httpJsonGet(url, authHeader, accept) {
        const headers = { 'Accept': accept || 'application/json' };
        if (authHeader) headers['Authorization'] = authHeader;
        const res = await this._netFetch(url, { method: 'GET', headers });
        if (!res.ok) {
            // Attach a body preview so Frappe exceptions ("Invalid filter …") surface in the UI
            // instead of the useless "HTTP 417".
            let detail = '';
            try {
                const txt = await res.text();
                try {
                    const j = JSON.parse(txt);
                    detail = j.exception || j._server_messages || j.message || txt.slice(0, 300);
                } catch { detail = txt.slice(0, 300); }
            } catch { /* body unreadable */ }
            const err = new Error(`HTTP ${res.status}${detail ? ` — ${detail}` : ''}`);
            err.status = res.status;
            throw err;
        }
        return res.json();
    }

    async _httpBinaryGet(url, authHeader) {
        const headers = {};
        if (authHeader) headers['Authorization'] = authHeader;
        const res = await this._netFetch(url, { method: 'GET', headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = reject;
            r.readAsDataURL(blob);
        });
    }

    _pubConfig(connectorId) {
        const def = this._connectorGet(connectorId);
        return {
            endpoint: localStorage.getItem(`ofs_pub_${connectorId}_endpoint`) || def.endpointDefault,
            apiKey: localStorage.getItem(`ofs_pub_${connectorId}_apikey`) || '',
            testMode: localStorage.getItem(`ofs_pub_${connectorId}_test`) !== '0'
        };
    }
    _pubSaveConfig(connectorId, cfg) {
        localStorage.setItem(`ofs_pub_${connectorId}_endpoint`, cfg.endpoint || '');
        localStorage.setItem(`ofs_pub_${connectorId}_apikey`, cfg.apiKey || '');
        localStorage.setItem(`ofs_pub_${connectorId}_test`, cfg.testMode ? '1' : '0');
    }

    // Legacy Woningborg keys (pre-refactor) — migrate once so users don't re-enter creds.
    _pubMigrateLegacy() {
        if (localStorage.getItem('ofs_pub_wb_endpoint')) return;
        const oldEp = localStorage.getItem('ofs_wb_endpoint');
        const oldKey = localStorage.getItem('ofs_wb_api_key');
        const oldTest = localStorage.getItem('ofs_wb_test_mode');
        if (oldEp) localStorage.setItem('ofs_pub_wb_endpoint', oldEp);
        if (oldKey) localStorage.setItem('ofs_pub_wb_apikey', oldKey);
        if (oldTest !== null) localStorage.setItem('ofs_pub_wb_test', oldTest);
    }

    _buildAfasPayload(ho) {
        const p = this.project;
        // AFAS KnSubject UpdateConnector — pragmatic shape until klant deelt hun eigen definitie.
        return {
            KnSubject: {
                Element: {
                    Fields: {
                        StId: 'OFS_DOSSIER',
                        Ds: `Opleverdossier ${p.name || ''} (${ho.date})`,
                        SbTx: this._afasNotesText(ho),
                        DaTi: new Date().toISOString(),
                        ExRi: p.number || p.name || '',
                        ...(p.bagData?.pandId ? { BAG_Pand: p.bagData.pandId } : {})
                    }
                }
            }
        };
    }
    _afasNotesText(ho) {
        const verdictMap = { approved: "APPROVED", conditional: 'ONDER VOORBEHOUD', rejected: "REJECTED" };
        const lines = [
            `Type: ${this.hoTypeLabel(ho.type)}`,
            `Datum: ${ho.date}`,
            `Eindoordeel: ${verdictMap[ho.verdict] || ho.verdict}`,
            `Deelnemers: ${(ho.participants || []).map(pt => pt.name).join(', ')}`,
            `Aantal punten: ${ho.items?.length || 0}`
        ];
        if (ho.notes) lines.push(`Opmerkingen: ${ho.notes}`);
        return lines.join('\n');
    }

    _buildErpnextPayload(ho) {
        // Doel: Frappe Project-doctype of custom OFS Doctype.
        const p = this.project;
        const verdictMap = { approved: 'Approved', conditional: 'Conditional', rejected: 'Rejected' };
        return {
            project_name: `${p.name || ''} — ${this.hoTypeLabel(ho.type)} ${ho.date}`,
            expected_start_date: p.surveyDate || null,
            expected_end_date: ho.date || null,
            notes: this._afasNotesText(ho),
            custom_ofs_verdict: verdictMap[ho.verdict] || ho.verdict,
            custom_ofs_bag_pand: p.bagData?.pandId || null,
            custom_ofs_participants: (ho.participants || []).map(pt => `${pt.name} (${pt.role})`).join('; '),
            custom_ofs_open_items: (ho.items || []).length
        };
    }

    _buildBouw7Payload(ho) {
        // Bouw7 document-koppeling: gestandaardiseerd document met projectkoppeling en kern-veld voor opleverdossier.
        const p = this.project;
        return {
            title: `Opleverdossier ${p.name || ''} (${ho.date})`,
            type: 'oplevering',
            projectReference: p.number || p.name,
            externalId: `ofs-${ho.id}`,
            date: ho.date,
            verdict: ho.verdict,
            summary: this._afasNotesText(ho),
            participants: (ho.participants || []).map(pt => ({ name: pt.name, role: pt.role, company: pt.company || '' })),
            openItems: (ho.items || []).filter(it => it.verdict !== 'approved').length,
            source: 'openfieldstudio'
        };
    }

    _buildKypPayload() {
        const p = this.project;
        const priorityMap = { high: 'high', medium: 'normal', low: 'low' };
        const openTickets = this.tickets.filter(t => t.status !== 'archived' && t.status !== 'verified');
        return {
            source: 'openfieldstudio',
            project: { name: p.name, number: p.number },
            tasks: openTickets.map(t => ({
                externalId: t.id,
                title: t.label,
                description: t.description || '',
                priority: priorityMap[t.priority] || 'normal',
                category: t.category || null,
                dueDate: t.deadline || null,
                assignee: t.assignedTo || null,
                status: t.status
            }))
        };
    }

    _buildExactPayload(ho) {
        const p = this.project;
        // Exact Online Document — Subject + Body. Attachments zouden via aparte call
        // (DocumentAttachments) volgen; hier alleen de master-record voor eerste PoC.
        return {
            Subject: `Opleverdossier ${p.name || ''} (${ho.date})`,
            Body: this._afasNotesText(ho),
            Category: '00000000-0000-0000-0000-000000000000',
            Type: 8
        };
    }

    _buildWoningborgPayload(ho) {
        const verdictMap = { approved: "approved", conditional: 'onder-voorbehoud', rejected: "rejected" };
        const p = this.project;
        return {
            schemaVersion: 'ofs.wb.v0',
            externalRef: p.number || p.name,
            gegenereerdDoor: 'Field Workspace',
            gegenereerdOp: new Date().toISOString(),
            project: {
                naam: p.name,
                projectnummer: p.number,
                opdrachtgever: p.client,
                contactpersoon: p.contactPerson,
                adres: {
                    straat: p.address,
                    postcode: p.postalCode,
                    plaats: p.city,
                    bag: p.bagData ? {
                        nummeraanduiding: p.bagData.nummeraanduidingId,
                        verblijfsobject: p.bagData.adresseerbaarObjectId,
                        pand: p.bagData.pandId
                    } : null
                }
            },
            oplevering: {
                type: this.hoTypeLabel(ho.type),
                datum: ho.date,
                eindoordeel: verdictMap[ho.verdict] || ho.verdict,
                opmerkingen: ho.notes || '',
                deelnemers: (ho.participants || []).map(pt => ({ naam: pt.name, rol: pt.role, bedrijf: pt.company || '' })),
                items: (ho.items || []).map(it => {
                    const t = this.tickets.find(tk => tk.id === it.ticketId);
                    return t ? { label: t.label, categorie: t.category, oordeel: verdictMap[it.verdict] || it.verdict, opmerkingen: it.notes || '' } : null;
                }).filter(Boolean),
                handtekeningen: (ho.signatures || []).map(s => ({ naam: s.name, rol: s.role, ondertekendOp: s.date }))
            }
        };
    }

    openWoningborgModal(hoId) { this.openPublishModal(hoId, 'wb'); }
    closeWoningborgModal() { this.closePublishModal(); }

    // =====================================================
    // IMPORT FLOW — bidirectional connectors (klant/contacten/tekeningen ophalen)
    // =====================================================
    _erpnextAuthHeader(cfg) {
        return (cfg.apiKey || '').includes(':') ? `token ${cfg.apiKey}` : `Bearer ${cfg.apiKey}`;
    }
    // Extract "https://site/" from an ERPNext endpoint like "https://site/api/resource/Project".
    _erpnextBaseUrl(cfg) {
        const m = (cfg.endpoint || '').match(/^(https?:\/\/[^/]+)/);
        return m ? m[1] : '';
    }

    // =====================================================
    // LINKED-SOURCE BACK-SYNC — save the OFS project file onto the linked source
    // project. Connector-agnostic: any connector def with a `backSync(cfg, ref, data)`
    // implementation participates (currently ERPNext + n8n/webhook).
    // =====================================================
    refreshErpLinkBadge(state) {
        const el = document.getElementById('erp-link-badge');
        if (!el) return;
        const ref = this.project?.erpRef;
        if (!ref?.id) { el.style.display = 'none'; return; }
        const def = this._connectorGet(ref.connector);
        const label = def.shortLabel || def.label || ref.connector;
        el.style.display = 'inline-flex';
        const icon = state === 'busy' ? '⏳' : state === 'fail' ? '⚠' : '⇄';
        el.textContent = `${icon} ${label}: ${ref.id}`;
        el.title = this.tFormat('erp_link_title', label, ref.id)
            + (ref.lastSyncAt ? `\n${this.tFormat('erp_last_sync', new Date(ref.lastSyncAt).toLocaleString())}` : '');
        el.style.color = state === 'fail' ? 'var(--danger, #dc2626)' : 'var(--success, #059669)';
    }

    _buildProjectExport() {
        return {
            version: '2.0', exportDate: new Date().toISOString(),
            project: this.project, contacts: this.contacts, floorPlans: this.floorPlans,
            tickets: this.tickets, inspections: this.inspections, handovers: this.handovers,
            checklistTemplates: this.checklistTemplates, activityLog: this.activityLog
        };
    }

    async syncProjectToLinked(manual = false) {
        const ref = this.project?.erpRef;
        if (!ref?.id || !ref.connector) return;
        const def = this._connectorGet(ref.connector);
        if (typeof def.backSync !== 'function') return;
        const label = def.shortLabel || def.label || ref.connector;
        const cfg = this._pubConfig(ref.connector);
        if (this._erpSyncBusy) return;
        this._erpSyncBusy = true;
        this.refreshErpLinkBadge('busy');
        try {
            await def.backSync(cfg, ref, this._buildProjectExport());
            this.project.erpRef.lastSyncAt = new Date().toISOString();
            this.saveToLocalStorage();
            this.refreshErpLinkBadge();
            if (manual) this.showNotification(this.tFormat('erp_sync_ok', label, ref.id), 'success');
            this.logActivity(this.tFormat('act_erp_sync', label, ref.id));
        } catch (err) {
            console.error('Back-sync failed', err);
            this.refreshErpLinkBadge('fail');
            this.showNotification(this.tFormat('erp_sync_fail', label, err.message || err), 'error');
        } finally {
            this._erpSyncBusy = false;
        }
    }

    // ERPNext: upload the export as ONE stable attachment `OFS_<projectId>.json` on the
    // linked Project doc; previous OFS_* attachments are removed first so repeated
    // saves don't pile up files.
    async _erpnextBackSync(cfg, ref, data) {
        if (!cfg.endpoint || !cfg.apiKey) throw new Error(this.t('wb_missing_creds'));
        const base = ref.base || this._erpnextBaseUrl(cfg);
        const auth = this._erpnextAuthHeader(cfg);
        const fileName = `OFS_${ref.id}.json`;
        try {
            const filters = encodeURIComponent(JSON.stringify([
                ['attached_to_doctype', '=', 'Project'],
                ['attached_to_name', '=', ref.id],
                ['file_name', 'like', 'OFS_%']
            ]));
            const old = await this._httpJsonGet(`${base}/api/resource/File?filters=${filters}&fields=${encodeURIComponent(JSON.stringify(['name', 'file_name']))}&limit_page_length=20`, auth).then(r => r?.data || []);
            for (const f of old) {
                await this._netFetch(`${base}/api/resource/File/${encodeURIComponent(f.name)}`, {
                    method: 'DELETE', headers: { 'Authorization': auth, 'Accept': 'application/json' }
                }).catch(e => console.warn('old OFS file delete failed', f.name, e));
            }
        } catch (e) { console.warn('old OFS file cleanup failed', e); }

        const fd = new FormData();
        fd.append('file', new Blob([JSON.stringify(data)], { type: 'application/json' }), fileName);
        fd.append('is_private', '1');
        fd.append('doctype', 'Project');
        fd.append('docname', ref.id);
        const res = await this._netFetch(`${base}/api/method/upload_file`, {
            method: 'POST',
            headers: { 'Authorization': auth, 'Accept': 'application/json' },
            body: fd
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }

    // n8n/webhook: POST the export in a typed envelope to the configured webhook.
    // The receiving workflow distinguishes it from dossier-publishes by `type` and can
    // route it to any target system (SharePoint, Dropbox, own ERP, ...).
    async _webhookBackSync(cfg, ref, data) {
        const url = ref.base || cfg.endpoint;
        if (!url) throw new Error(this.t('wb_missing_creds'));
        const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;
        const res = await this._netFetch(url, {
            method: 'POST', headers,
            body: JSON.stringify({
                type: 'ofs.project.sync',
                source: 'openfieldstudio',
                projectRef: ref.id,
                savedAt: new Date().toISOString(),
                data
            })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }

    // Fetch everything OFS wants to know about one ERPNext customer: the doc itself,
    // contacts + addresses (linked via the "Dynamic Link" child table — Frappe REST
    // requires 4-tuple filters `["<ChildDocType>", "<field>", "<op>", <val>]` for
    // child-table fields; 3-tuples return zero rows or error silently), and attachments.
    async _erpnextCustomerBundle(base, auth, customerId) {
        if (!customerId) return { cust: null, contactsList: [], primaryAddr: {}, custFiles: [] };
        const soft = (label, p, fallback) => p.catch(err => { console.warn(`ERPNext ${label} failed:`, err); return fallback; });
        const linkFilter = JSON.stringify([['Dynamic Link', 'link_doctype', '=', 'Customer'], ['Dynamic Link', 'link_name', '=', customerId]]);
        const fileFilters = encodeURIComponent(JSON.stringify([['attached_to_doctype', '=', 'Customer'], ['attached_to_name', '=', customerId]]));
        const [cust, contactsList, addrList, custFiles] = await Promise.all([
            soft('customer', this._httpJsonGet(`${base}/api/resource/Customer/${encodeURIComponent(customerId)}`, auth).then(r => r?.data || null), null),
            soft('contacts', this._httpJsonGet(`${base}/api/resource/Contact?filters=${encodeURIComponent(linkFilter)}&fields=${encodeURIComponent(JSON.stringify(['name','first_name','last_name','email_id','mobile_no','company_name','designation']))}&limit_page_length=100`, auth).then(r => r?.data || []), []),
            soft('address', this._httpJsonGet(`${base}/api/resource/Address?filters=${encodeURIComponent(linkFilter)}&fields=${encodeURIComponent(JSON.stringify(['address_line1','pincode','city','country','is_primary_address']))}&limit_page_length=10`, auth).then(r => r?.data || []), []),
            soft('customer files', this._httpJsonGet(`${base}/api/resource/File?filters=${fileFilters}&fields=${encodeURIComponent(JSON.stringify(['name','file_name','file_url','file_type']))}&limit_page_length=100`, auth).then(r => r?.data || []), [])
        ]);
        const primaryAddr = addrList.find(a => a.is_primary_address) || addrList[0] || {};
        return { cust, contactsList, primaryAddr, custFiles };
    }

    _erpnextMapFiles(base, filesList) {
        // Accept image formats + PDF. applyImport() rasterizes PDFs via pdf.js.
        return (filesList || [])
            .filter(f => /\.(png|jpe?g|pdf|gif|webp|svg)$/i.test(f.file_name || f.file_url || ''))
            .map(f => ({
                name: f.file_name || 'Bijlage',
                url: /^https?:/.test(f.file_url) ? f.file_url : `${base}${f.file_url}`,
                type: f.file_type || ''
            }));
    }

    async _importFromErpnext(cfg) {
        const base = this._erpnextBaseUrl(cfg);
        if (!base) throw new Error(this.t('import_bad_endpoint'));
        const auth = this._erpnextAuthHeader(cfg);
        const soft = (label, p, fallback) => p.catch(err => { console.warn(`ERPNext ${label} failed:`, err); return fallback; });

        // Project-first: the natural unit for OFS is an ERPNext Project (naam + nummer +
        // gekoppelde klant + bijlagen). Environments without the Projects module fall
        // back to the customer-based flow below.
        this._setImportStatus(this.t('import_fetching_projects'));
        const projFields = encodeURIComponent(JSON.stringify(['name', 'project_name', 'customer', 'status']));
        const projects = await soft('projects',
            this._httpJsonGet(`${base}/api/resource/Project?fields=${projFields}&limit_page_length=1000&order_by=${encodeURIComponent('modified desc')}`, auth).then(r => r?.data || []),
            []);

        let chosenProject = null;
        let customerId = null;

        if (projects.length) {
            const pick = await this._awaitImportPicker(projects.map(p => ({
                id: p.name,
                label: p.project_name || p.name,
                hint: [p.name, p.customer].filter(Boolean).join(' · ')
            })), 'import_pick_project');
            if (!pick) return null;
            chosenProject = projects.find(p => p.name === pick) || { name: pick };
            customerId = chosenProject.customer || null;
        } else {
            // Fallback: customer-based (no Projects in this environment)
            this._setImportStatus(this.t('import_fetching_customers'));
            const fields = encodeURIComponent(JSON.stringify(['name', 'customer_name', 'primary_address', 'mobile_no', 'email_id']));
            const filters = encodeURIComponent(JSON.stringify([['disabled', '=', 0]]));
            const listRes = await this._httpJsonGet(`${base}/api/resource/Customer?fields=${fields}&filters=${filters}&limit_page_length=200`, auth);
            const customers = (listRes && listRes.data) || [];
            if (!customers.length) throw new Error(this.t('import_no_customers'));
            const chosen = await this._awaitImportPicker(customers.map(c => ({
                id: c.name,
                label: c.customer_name || c.name,
                hint: c.email_id || c.mobile_no || ''
            })));
            if (!chosen) return null;
            customerId = chosen;
        }

        this._setImportStatus(this.t('import_fetching_details'));
        const bundlePromise = this._erpnextCustomerBundle(base, auth, customerId);
        // Project attachments (drawings usually live on the Project, not the Customer)
        const projFilesPromise = chosenProject
            ? soft('project files', this._httpJsonGet(`${base}/api/resource/File?filters=${encodeURIComponent(JSON.stringify([['attached_to_doctype', '=', 'Project'], ['attached_to_name', '=', chosenProject.name]]))}&fields=${encodeURIComponent(JSON.stringify(['name','file_name','file_url','file_type']))}&limit_page_length=100`, auth).then(r => r?.data || []), [])
            : Promise.resolve([]);
        const [{ cust, contactsList, primaryAddr, custFiles }, projFiles] = await Promise.all([bundlePromise, projFilesPromise]);

        // Only attach the ERPNext auth header to URLs that share the connector's origin —
        // File.file_url can legitimately point at S3/CDN via the Attachment app, and forwarding
        // the ERPNext token there would leak credentials to a third party.
        let baseOrigin = '';
        try { baseOrigin = new URL(base).origin; } catch { /* invalid base */ }
        const sameOriginFetch = (url) => {
            let same = false;
            try { same = new URL(url, base).origin === baseOrigin; } catch { /* invalid url */ }
            return this._httpBinaryGet(url, same ? auth : null);
        };

        const clientName = cust?.customer_name || customerId || '';
        return {
            project: (chosenProject || cust) ? {
                name: chosenProject ? (chosenProject.project_name || chosenProject.name) : '',
                number: chosenProject ? chosenProject.name : '',
                client: clientName,
                address: primaryAddr.address_line1 || '',
                postalCode: primaryAddr.pincode || '',
                city: primaryAddr.city || ''
            } : null,
            contacts: contactsList.map(c => ({
                name: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.name,
                role: c.designation || 'Contactpersoon',
                company: c.company_name || clientName,
                email: c.email_id || '',
                phone: c.mobile_no || ''
            })),
            // Project drawings first, then customer attachments
            floorPlans: [...this._erpnextMapFiles(base, projFiles), ...this._erpnextMapFiles(base, custFiles)],
            _fetchBinary: sameOriginFetch,
            // Link metadata so applyImport can remember which ERP project this came from
            // (enables automatic back-sync of the OFS project file to that project).
            _meta: chosenProject ? { connector: 'erpnext', doctype: 'Project', id: chosenProject.name, base } : null
        };
    }

    async _importFromWebhook(cfg) {
        // Convention: publish endpoint is POST-only; the read endpoint is either
        // the same URL as GET, or a separate URL stored as a query hint.
        // Simplest: GET the same URL — n8n workflow decides based on method.
        const url = cfg.endpoint;
        const auth = cfg.apiKey ? `Bearer ${cfg.apiKey}` : null;
        this._setImportStatus(this.t('import_fetching_generic'));
        const data = await this._httpJsonGet(url, auth);
        // Same-origin gate — never leak the webhook token to external file URLs (S3, imgix, …).
        let baseOrigin = '';
        try { baseOrigin = new URL(cfg.endpoint).origin; } catch { /* invalid endpoint */ }
        const fetchBinary = async (fileUrl) => {
            let same = false;
            try { same = new URL(fileUrl, cfg.endpoint).origin === baseOrigin; } catch { /* invalid url */ }
            return this._httpBinaryGet(fileUrl, same ? auth : null);
        };
        // Link metadata: the workflow may return an explicit `projectRef`; otherwise fall
        // back to the imported project's number/name so back-sync still has a stable id.
        const refId = data.projectRef || data.project?.number || data.project?.name || null;
        return {
            project: data.project || null,
            contacts: Array.isArray(data.contacts) ? data.contacts : [],
            floorPlans: Array.isArray(data.floorPlans) ? data.floorPlans : [],
            _fetchBinary: fetchBinary,
            _meta: refId ? { connector: 'webhook', doctype: 'external', id: String(refId), base: cfg.endpoint } : null
        };
    }

    // Importable + configured connectors (used by the Project-tab shortcut button).
    _importableConnectors() {
        this._pubMigrateLegacy();
        return Object.values(this._connectorDefs()).filter(def => {
            if (!def.canImport) return false;
            const cfg = this._pubConfig(def.id);
            return !!(cfg.endpoint && cfg.apiKey);
        });
    }

    // Always show the Project-tab import button (discoverability); dim it when no
    // bidirectional connector is configured yet — clicking then explains what to set up.
    refreshProjectImportBtn() {
        const btn = document.getElementById('project-import-btn');
        if (!btn) return;
        const ready = this._importableConnectors().length > 0;
        btn.style.display = 'inline-flex';
        btn.style.opacity = ready ? '' : '0.55';
        btn.title = ready ? '' : this.t('import_none_configured');
    }

    // Entry point from the Project tab: pick a connector (if more than one), then run its import.
    async openProjectImport() {
        const options = this._importableConnectors();
        if (!options.length) {
            this.showNotification(this.t('import_none_configured'), 'error');
            this.switchTab('koppelingen');
            return;
        }
        if (options.length === 1) {
            return this.openConnectorImport(options[0].id);
        }
        // Multiple candidates: reuse the import-modal picker to choose the source system.
        this._importCurrentDef = null;
        this._importPickerResolve = null;
        this._importPreviewData = null;
        document.getElementById('import-modal-title').textContent = this.t('import_modal_title_generic');
        document.getElementById('import-picker').innerHTML = '';
        document.getElementById('import-preview').innerHTML = '';
        document.getElementById('import-preview').style.display = 'none';
        document.getElementById('import-confirm').style.display = 'none';
        this._setImportStatus('');
        document.getElementById('import-modal').classList.add('active');
        const chosen = await this._awaitImportPicker(options.map(def => ({ id: def.id, label: def.label })), 'import_pick_connector');
        if (!chosen) return;
        return this.openConnectorImport(chosen);
    }

    async openConnectorImport(connectorId) {
        const def = this._connectorGet(connectorId);
        if (!def.canImport) { this.showNotification(this.t('import_not_supported'), 'error'); return; }
        const cfg = this._pubConfig(connectorId);
        if (!cfg.endpoint || !cfg.apiKey) { this.showNotification(this.t('wb_missing_creds'), 'error'); return; }
        this._importCurrentDef = def;
        this._importPickerResolve = null;
        this._importPreviewData = null;
        // Reset + open modal
        document.getElementById('import-modal-title').textContent = this.tFormat('import_modal_title', def.label);
        document.getElementById('import-picker').innerHTML = '';
        document.getElementById('import-picker').style.display = 'none';
        document.getElementById('import-preview').innerHTML = '';
        document.getElementById('import-preview').style.display = 'none';
        document.getElementById('import-confirm').style.display = 'none';
        this._setImportStatus(this.t('import_starting'));
        document.getElementById('import-modal').classList.add('active');
        try {
            const data = await def.runImport(cfg);
            if (!data) { this.closeImportModal(); return; } // user cancelled
            this._importPreviewData = data;
            this._renderImportPreview(data);
        } catch (err) {
            console.error('Import error', err);
            this._setImportStatus(this.tFormat('import_error', err.message || err), 'error');
        }
    }

    closeImportModal() {
        document.getElementById('import-modal').classList.remove('active');
        if (this._importPickerResolve) { this._importPickerResolve(null); this._importPickerResolve = null; }
        this._importPreviewData = null;
    }

    _setImportStatus(msg, kind) {
        const el = document.getElementById('import-status');
        if (!el) return;
        el.textContent = msg || '';
        el.style.color = kind === 'error' ? 'var(--danger, #dc2626)'
                       : kind === 'success' ? 'var(--success, #059669)'
                       : 'var(--text-muted, #6b7280)';
    }

    _awaitImportPicker(items, promptKey) {
        // items: [{id, label, hint?}]. Large lists (ERPNext with honderden projecten)
        // get a search box + list-box; small lists keep the compact dropdown.
        const picker = document.getElementById('import-picker');
        const many = items.length > 8;
        const optionHtml = (list) => list.map(it =>
            `<option value="${this.esc(it.id)}">${this.esc(it.label)}${it.hint ? ' — ' + this.esc(it.hint) : ''}</option>`).join('');
        picker.innerHTML = `
            <label for="import-pick-select" style="display:block;margin-bottom:0.35rem;font-size:0.85rem;">${this.t(promptKey || 'import_pick_prompt')}</label>
            ${many ? `<input type="text" id="import-pick-search" placeholder="${this.esc(this.t('import_pick_search'))}" autocomplete="off" style="width:100%;padding:0.5rem;margin-bottom:0.5rem;">` : ''}
            <select id="import-pick-select" ${many ? 'size="10"' : ''} style="width:100%;padding:0.5rem;">
                ${optionHtml(items)}
            </select>
            ${many ? `<div id="import-pick-count" style="margin-top:0.35rem;font-size:0.75rem;color:var(--text-muted,#6b7280);">${this.tFormat('import_pick_count', items.length, items.length)}</div>` : ''}
            <button type="button" class="btn btn-primary" id="import-pick-ok" style="margin-top:0.5rem;">${this.t('import_pick_continue')}</button>
        `;
        picker.style.display = 'block';
        this._setImportStatus(this.t('import_pick_status'));
        if (many) {
            const search = document.getElementById('import-pick-search');
            const select = document.getElementById('import-pick-select');
            const count = document.getElementById('import-pick-count');
            search.addEventListener('input', () => {
                const q = search.value.trim().toLowerCase();
                const filtered = q
                    ? items.filter(it => (it.label + ' ' + (it.hint || '')).toLowerCase().includes(q))
                    : items;
                select.innerHTML = optionHtml(filtered);
                if (filtered.length) select.selectedIndex = 0;
                if (count) count.textContent = this.tFormat('import_pick_count', filtered.length, items.length);
            });
            setTimeout(() => search.focus(), 50);
        }
        return new Promise(resolve => {
            this._importPickerResolve = resolve;
            document.getElementById('import-pick-ok').addEventListener('click', () => {
                const val = document.getElementById('import-pick-select').value;
                if (!val) return; // filtered list empty — keep picker open
                picker.style.display = 'none';
                this._importPickerResolve = null;
                resolve(val);
            }, { once: false });
        });
    }

    _renderImportPreview(data) {
        const p = document.getElementById('import-preview');
        const proj = data.project;
        const contactCount = (data.contacts || []).length;
        const drawingCount = (data.floorPlans || []).length;
        const isProjectImport = !!(proj && (proj.name || proj.number));
        const projDesc = proj
            ? this.esc([
                isProjectImport ? [proj.name, proj.number && `(${proj.number})`].filter(Boolean).join(' ') : null,
                proj.client, proj.address,
                [proj.postalCode, proj.city].filter(Boolean).join(' ')
              ].filter(Boolean).join(' · '))
            : this.t('import_lbl_none');
        p.innerHTML = `
            <label class="checkbox-label"><input type="checkbox" id="imp-chk-project" ${proj ? 'checked' : 'disabled'}>
                <span><strong>${this.t(isProjectImport ? 'import_lbl_projectdata' : 'import_lbl_customer')}</strong> — ${projDesc}</span>
            </label>
            <label class="checkbox-label" style="margin-top:0.35rem;"><input type="checkbox" id="imp-chk-contacts" ${contactCount ? 'checked' : 'disabled'}>
                <span><strong>${this.t('import_lbl_contacts')}</strong> — ${this.tFormat('import_lbl_count', contactCount)}</span>
            </label>
            <label class="checkbox-label" style="margin-top:0.35rem;"><input type="checkbox" id="imp-chk-drawings" ${drawingCount ? 'checked' : 'disabled'}>
                <span><strong>${this.t('import_lbl_drawings')}</strong> — ${this.tFormat('import_lbl_count', drawingCount)}${drawingCount ? ' (' + this.t('import_lbl_drawings_note') + ')' : ''}</span>
            </label>
        `;
        p.style.display = 'block';
        document.getElementById('import-confirm').style.display = 'inline-flex';
        this._setImportStatus(this.t('import_ready'), 'success');
    }

    async confirmImport() {
        const data = this._importPreviewData;
        if (!data) return;
        const applyProject = document.getElementById('imp-chk-project')?.checked;
        const applyContacts = document.getElementById('imp-chk-contacts')?.checked;
        const applyDrawings = document.getElementById('imp-chk-drawings')?.checked;
        try {
            const stats = await this.applyImport(data, { project: applyProject, contacts: applyContacts, drawings: applyDrawings });
            const skipped = (stats.contactsSkipped || 0) + (stats.drawingsSkipped || 0);
            const msg = skipped > 0
                ? this.tFormat('import_applied_with_skipped', stats.contacts, stats.drawings, skipped)
                : this.tFormat('import_applied', stats.contacts, stats.drawings);
            this._setImportStatus(msg, 'success');
            this.logActivity(this.tFormat('act_import_ok', this._importCurrentDef?.label || '?', stats.contacts, stats.drawings));
            setTimeout(() => this.closeImportModal(), 1200);
        } catch (err) {
            console.error('Import apply error', err);
            this._setImportStatus(this.tFormat('import_error', err.message || err), 'error');
        }
    }

    async applyImport(data, sel) {
        let contactsAdded = 0;
        let drawingsAdded = 0;
        if (sel.project && data.project) {
            const p = this.project;
            const src = data.project;
            if (src.name) p.name = src.name;
            if (src.number) p.number = src.number;
            if (src.client) p.client = src.client;
            if (src.address) p.address = src.address;
            if (src.postalCode) p.postalCode = src.postalCode;
            if (src.city) p.city = src.city;
            if (src.contactPerson) p.contactPerson = src.contactPerson;
            // Remember the source ERP project so saves can flow back automatically.
            if (data._meta?.id) {
                p.erpRef = {
                    connector: data._meta.connector, doctype: data._meta.doctype,
                    id: data._meta.id, base: data._meta.base,
                    linkedAt: new Date().toISOString()
                };
            }
            this.loadProjectForm();
        }
        let contactsSkipped = 0;
        let drawingsSkipped = 0;
        if (sel.contacts && Array.isArray(data.contacts)) {
            // Dedup on email (case-insensitive) or on (name+company). Re-importing the same
            // customer must not double every contact.
            const keyOf = (c) => (c.email || '').trim().toLowerCase()
                || `${(c.name || '').trim().toLowerCase()}::${(c.company || '').trim().toLowerCase()}`;
            const seen = new Set(this.contacts.map(keyOf));
            for (const c of data.contacts) {
                if (!c.name) { contactsSkipped++; continue; }
                const k = keyOf(c);
                if (seen.has(k)) { contactsSkipped++; continue; }
                seen.add(k);
                this.contacts.push({
                    id: this.genId(),
                    name: c.name, role: c.role || 'Contactpersoon',
                    company: c.company || '', email: c.email || '', phone: c.phone || ''
                });
                contactsAdded++;
            }
            this.renderContacts();
        }
        if (sel.drawings && Array.isArray(data.floorPlans)) {
            // Strict data-URL validator: matches only well-formed base64 image/pdf payloads.
            // Blocks attribute-breakout attempts if a hostile connector returns crafted "data:image/…;… <script>"
            // strings that would otherwise land unescaped in an <img src="…">.
            const isSafeDataUrl = (s) => typeof s === 'string' && /^data:[a-z0-9]+\/[a-z0-9+.\-]+;base64,[A-Za-z0-9+/=]+$/.test(s);

            for (const fp of data.floorPlans) {
                try {
                    let dataUrl = fp.dataUrl;
                    if (!dataUrl && fp.url && typeof data._fetchBinary === 'function') {
                        dataUrl = await data._fetchBinary(fp.url);
                    }
                    if (!dataUrl) { drawingsSkipped++; continue; }

                    // PDFs: reuse the existing pdf.js rasterization pipeline (one image per page).
                    if (dataUrl.startsWith('data:application/pdf')) {
                        try {
                            const b64 = dataUrl.split(',')[1] || '';
                            const bin = atob(b64);
                            const bytes = new Uint8Array(bin.length);
                            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                            const file = new File([bytes], fp.name || 'import.pdf', { type: 'application/pdf' });
                            const before = this.floorPlans.length;
                            await this.processPDFFile(file);
                            drawingsAdded += (this.floorPlans.length - before);
                        } catch (pdfErr) {
                            console.warn('PDF rasterization failed', fp, pdfErr);
                            drawingsSkipped++;
                        }
                        continue;
                    }

                    if (!isSafeDataUrl(dataUrl) || !dataUrl.startsWith('data:image')) {
                        drawingsSkipped++;
                        continue;
                    }
                    this.floorPlans.push({ id: this.genId(), name: (fp.name || 'Import').slice(0, 200), data: dataUrl, type: fp.type || 'image/jpeg' });
                    drawingsAdded++;
                } catch (e) {
                    console.warn('Skipping drawing (fetch failed)', fp, e);
                    drawingsSkipped++;
                }
            }
            this.renderFloorPlansList();
            this.updateFloorPlanSelector();
        }
        this.saveToLocalStorage();
        return { contacts: contactsAdded, drawings: drawingsAdded, contactsSkipped, drawingsSkipped };
    }

    renderConnectorsList() {
        const c = document.getElementById('connectors-list');
        if (!c) return;
        this._pubMigrateLegacy();
        c.innerHTML = Object.values(this._connectorDefs()).map(def => {
            const cfg = this._pubConfig(def.id);
            const configured = !!(cfg.endpoint && cfg.apiKey);
            const scopeTxt = def.scope === 'project' ? this.t('connector_scope_project') : this.t('connector_scope_handover');
            const badge = configured
                ? `<span class="status-badge status-verified">${this.t('connector_configured')}</span>`
                : `<span class="status-badge status-open">${this.t('connector_unconfigured')}</span>`;
            const importBtn = (def.canImport && configured)
                ? `<button class="btn btn-sm btn-secondary" onclick="app.openConnectorImport('${def.id}')" title="${this.t('import_btn_title')}">${this.t('import_btn')}</button>`
                : '';
            return `<div class="handover-card">
                <div class="handover-card-info">
                    <h4>${this.esc(def.label)} <span style="font-weight:400;font-size:0.75rem;color:var(--text-muted,#6b7280);">· ${scopeTxt}${def.canImport ? ' · ' + this.t('connector_bidirectional') : ''}</span></h4>
                    <p style="font-family:monospace;font-size:0.75rem;">${this.esc(cfg.endpoint || def.endpointDefault)}</p>
                </div>
                <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                    ${badge}
                    ${importBtn}
                    <button class="btn btn-sm btn-secondary" onclick="app.openConnectorConfig('${def.id}')">${this.t('connector_configure')}</button>
                </div>
            </div>`;
        }).join('');
    }

    // Open the publish modal in configure-only mode (no handover context, no send).
    openConnectorConfig(connectorId) {
        this._pubMigrateLegacy();
        this._pubCurrentHoId = null;
        this._pubCurrentConnId = connectorId;
        this._pubConfigOnly = true;
        const def = this._connectorGet(connectorId);
        const picker = document.getElementById('wb-connector');
        picker.innerHTML = `<option value="${def.id}">${def.label}</option>`;
        picker.value = def.id;
        this._applyConnectorToModal(connectorId);
        // Disable send in config-only mode
        const send = document.getElementById('wb-send');
        send.textContent = this.t('connector_save_only');
        send.dataset.configOnly = '1';
        document.getElementById('wb-modal').classList.add('active');
    }

    openPublishModal(hoId, connectorId) {
        // hoId may be null for project-scope connectors (e.g. KYP planning-sync).
        const def = this._connectorGet(connectorId || 'wb');
        if (def.scope !== 'project' && !this.handovers.find(h => h.id === hoId)) return;
        this._pubMigrateLegacy();
        this._pubCurrentHoId = hoId;
        this._pubCurrentConnId = connectorId || 'wb';
        // Populate connector picker — filter to same-scope connectors.
        const picker = document.getElementById('wb-connector');
        const wantScope = def.scope === 'project' ? 'project' : 'handover';
        const same = Object.values(this._connectorDefs()).filter(c => (c.scope || 'handover') === wantScope);
        picker.innerHTML = same.map(c => `<option value="${c.id}">${c.label}</option>`).join('');
        picker.value = this._pubCurrentConnId;
        this._applyConnectorToModal(this._pubCurrentConnId);
        document.getElementById('wb-modal').classList.add('active');
    }
    closePublishModal() {
        document.getElementById('wb-modal').classList.remove('active');
        // Reset config-only state so next open (from handover card) behaves normally.
        this._pubConfigOnly = false;
        const send = document.getElementById('wb-send');
        if (send && send.dataset.configOnly) {
            send.textContent = this.t('wb_send') || 'Verstuur';
            delete send.dataset.configOnly;
        }
        // Re-render connectors list in case configured-state changed.
        this.renderConnectorsList();
        this.refreshProjectImportBtn();
    }

    _applyConnectorToModal(connectorId) {
        this._pubCurrentConnId = connectorId;
        const def = this._connectorGet(connectorId);
        const isConfigOnly = !!this._pubConfigOnly;
        const ho = def.scope === 'project' ? null : this.handovers.find(h => h.id === this._pubCurrentHoId);
        if (!isConfigOnly && def.scope !== 'project' && !ho) return;
        const cfg = this._pubConfig(connectorId);
        // Title + placeholders follow the ACTIVE connector — the static HTML defaults
        // (Woningborg) confused users configuring e.g. ERPNext.
        const title = document.getElementById('wb-modal-title');
        if (title) title.textContent = isConfigOnly
            ? this.tFormat('connector_config_title', def.label)
            : this.tFormat('pub_modal_title_for', def.label);
        const epEl = document.getElementById('wb-endpoint');
        epEl.value = cfg.endpoint;
        epEl.placeholder = def.endpointDefault;
        const keyEl = document.getElementById('wb-apikey');
        keyEl.value = cfg.apiKey;
        keyEl.placeholder = def.apiKeyLabel;
        document.getElementById('wb-testmode').checked = cfg.testMode;
        if (isConfigOnly) {
            document.getElementById('wb-payload').value = this.t('connector_config_only_hint');
        } else {
            const payload = def.build(ho);
            document.getElementById('wb-payload').value = JSON.stringify(payload, null, 2);
        }
        document.getElementById('wb-status').textContent = '';
        // Adaptive labels
        const setLbl = (id, txt) => { const el = document.getElementById(id)?.closest('.form-group')?.querySelector('label'); if (el) el.textContent = txt; };
        setLbl('wb-endpoint', def.endpointLabel);
        setLbl('wb-apikey', def.apiKeyLabel);
        const info = document.getElementById('wb-info-txt');
        if (info) info.textContent = this.t(def.infoKey);
    }

    async publishToWoningborg() {
        const hoId = this._pubCurrentHoId;
        const connectorId = this._pubCurrentConnId || 'wb';
        const def = this._connectorGet(connectorId);
        const isConfigOnly = !!this._pubConfigOnly;
        const cfg = {
            endpoint: document.getElementById('wb-endpoint').value.trim(),
            apiKey: document.getElementById('wb-apikey').value.trim(),
            testMode: document.getElementById('wb-testmode').checked
        };
        this._pubSaveConfig(connectorId, cfg);
        if (isConfigOnly) {
            const status = document.getElementById('wb-status');
            if (!cfg.endpoint || !cfg.apiKey) {
                // Saved, but the connector is not active yet — tell the user what's missing
                // instead of a green "opgeslagen" that leaves everything on "Niet ingesteld".
                status.textContent = this.t('connector_saved_incomplete');
                status.style.color = 'var(--danger, #dc2626)';
            } else if (def.canImport) {
                status.textContent = this.t('connector_saved_import_hint');
                status.style.color = 'var(--success, #059669)';
            } else {
                status.textContent = this.t('connector_saved');
                status.style.color = 'var(--success, #059669)';
            }
            this.refreshProjectImportBtn();
            return;
        }
        const ho = def.scope === 'project' ? null : this.handovers.find(h => h.id === hoId);
        if (def.scope !== 'project' && !ho) return;
        const payload = def.build(ho);
        const status = document.getElementById('wb-status');
        if (cfg.testMode) {
            status.textContent = this.tFormat('pub_test_ok', def.label);
            status.style.color = 'var(--success, #059669)';
            this.logActivity(this.tFormat('act_pub_test', def.label, ho ? this.hoTypeLabel(ho.type) : (this.project.name || 'project')));
            return;
        }
        if (!cfg.endpoint || !cfg.apiKey) {
            status.textContent = this.t('wb_missing_creds');
            status.style.color = 'var(--danger, #dc2626)';
            return;
        }
        status.textContent = this.tFormat('pub_sending', def.label);
        status.style.color = 'var(--text-muted, #6b7280)';
        try {
            const res = await def.send(cfg, payload, ho);
            if (res.ok) {
                status.textContent = this.tFormat('pub_ok', def.label, res.ref || 'OK');
                status.style.color = 'var(--success, #059669)';
                this.logActivity(this.tFormat('act_pub_ok', def.label, ho ? this.hoTypeLabel(ho.type) : (this.project.name || 'project'), res.ref || ''));
            } else {
                status.textContent = this.tFormat('pub_http_error', def.label, res.status);
                status.style.color = 'var(--danger, #dc2626)';
            }
        } catch (err) {
            status.textContent = this.tFormat('wb_network_error', err.message || err);
            status.style.color = 'var(--danger, #dc2626)';
        }
    }

    viewHandover(id) {
        this.currentHandoverId = id;
        this.renderHandoverExecution();
        document.getElementById('oplevering-overview').style.display = 'none';
        document.getElementById('oplevering-execute').style.display = 'block';
        const ho = this.handovers.find(h => h.id === id);
        document.getElementById('finish-handover-btn').style.display = ho && ho.status === 'completed' ? 'none' : '';
    }

    // =====================================================
    // DASHBOARD
    // =====================================================
    updateDashboard() {
        const tickets = this.tickets;
        const today = new Date().toISOString().split('T')[0];
        const open = tickets.filter(t => t.status === 'open').length;
        const assigned = tickets.filter(t => t.status === 'assigned').length;
        const completed = tickets.filter(t => t.status === 'completed' || t.status === 'verified').length;
        const overdue = tickets.filter(t => t.deadline && t.deadline < today && t.status !== 'verified' && t.status !== 'archived').length;

        document.querySelector('#stat-total .stat-number').textContent = tickets.length;
        document.querySelector('#stat-open .stat-number').textContent = open;
        document.querySelector('#stat-assigned .stat-number').textContent = assigned;
        document.querySelector('#stat-completed .stat-number').textContent = completed;
        document.querySelector('#stat-overdue .stat-number').textContent = overdue;
        document.querySelector('#stat-inspections .stat-number').textContent = this.inspections.length;

        // Status chart
        const statusData = [
            { label: this.t('status_open'), count: open, color: '#D97706' },
            { label: this.t('status_assigned'), count: assigned, color: '#2563EB' },
            { label: this.t('status_completed'), count: completed, color: '#16A34A' },
            { label: this.t('lbl_overdue'), count: overdue, color: '#DC2626' }
        ];
        this.renderBarChart('chart-status', statusData);

        // Category chart
        const catCounts = {};
        tickets.forEach(t => { catCounts[t.category||'Overig'] = (catCounts[t.category||'Overig']||0) + 1; });
        const catData = Object.entries(catCounts).map(([label, count]) => ({ label, count, color: '#D97706' })).sort((a,b) => b.count - a.count);
        this.renderBarChart('chart-category', catData);

        // Assignee chart
        const assignCounts = {};
        tickets.filter(t => t.assignedTo).forEach(t => { assignCounts[t.assignedTo] = (assignCounts[t.assignedTo]||0) + 1; });
        const assignData = Object.entries(assignCounts).map(([label, count]) => ({ label, count, color: '#2563EB' })).sort((a,b) => b.count - a.count);
        this.renderBarChart('chart-assignee', assignData.length ? assignData : [{ label: this.t('no_assignments'), count: 0, color: '#A1A1AA' }]);

        // Activity log
        const logC = document.getElementById('activity-log');
        if (!this.activityLog.length) { logC.innerHTML = `<p class="empty-state">${this.t('empty_activity')}</p>`; return; }
        logC.innerHTML = this.activityLog.slice(-20).reverse().map(a => `
            <div class="activity-item"><span class="activity-time">${new Date(a.date).toLocaleString('en-GB',{hour:'2-digit',minute:'2-digit',day:'numeric',month:'short'})}</span><span>${this.esc(a.text)}</span></div>
        `).join('');
    }

    renderBarChart(containerId, data) {
        const max = Math.max(...data.map(d => d.count), 1);
        document.getElementById(containerId).innerHTML = data.map(d => `
            <div class="chart-bar-row"><span class="chart-bar-label">${this.esc(d.label)}</span>
            <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${(d.count/max)*100}%;background:${d.color}"></div></div>
            <span class="chart-bar-count">${d.count}</span></div>
        `).join('');
    }

    logActivity(text) { this.activityLog.push({ text, date: new Date().toISOString() }); if (this.activityLog.length > 100) this.activityLog = this.activityLog.slice(-100); }

    // =====================================================
    // EXPORT
    // =====================================================
    updateExportTypeUI() {
        const type = document.querySelector('input[name="export-type"]:checked').value;
        document.getElementById('export-inspection-select').style.display = type === 'inspection' ? 'block' : 'none';
        document.getElementById('export-handover-select').style.display = type === 'handover' ? 'block' : 'none';
        if (type === 'inspection') {
            document.getElementById('export-inspection-id').innerHTML = this.inspections.map(i => `<option value="${i.id}">${this.esc(i.name)} (${i.date})</option>`).join('');
        }
        if (type === 'handover') {
            document.getElementById('export-handover-id').innerHTML = this.handovers.map(h => `<option value="${h.id}">${HO_TYPE_LABELS[h.type]} (${h.date})</option>`).join('');
        }
    }

    updateExportSummary() {
        const totalPhotos = this.tickets.reduce((a, p) => a + (p.photos?.length || 0), 0);
        const s = document.getElementById('export-summary');
        if (!this.project.name && !this.tickets.length) { s.innerHTML = `<p>${this.t('empty_export')}</p>`; return; }
        s.innerHTML = `
            <div class="summary-item"><h4>${this.t('sum_project')}</h4><p>${this.project.name || this.t('sum_not_filled')}</p></div>
            <div class="summary-item"><h4>${this.t('sum_address')}</h4><p>${this.project.address || this.t('sum_not_filled')}</p></div>
            <div class="summary-item"><h4>${this.t('sum_plans')}</h4><p>${this.floorPlans.length}</p></div>
            <div class="summary-item"><h4>${this.t('sum_tickets')}</h4><p>${this.tickets.length}</p></div>
            <div class="summary-item"><h4>${this.t('sum_photos')}</h4><p>${totalPhotos}</p></div>
            <div class="summary-item"><h4>${this.t('sum_inspections')}</h4><p>${this.inspections.length}</p></div>
            <div class="summary-item"><h4>${this.t('sum_handovers')}</h4><p>${this.handovers.length}</p></div>`;
        this.updateExportTypeUI();
    }

    async exportHTML() {
        const type = document.querySelector('input[name="export-type"]:checked').value;
        let html;
        if (type === 'handover') {
            const hoId = document.getElementById('export-handover-id').value;
            html = this.generateHandoverReport(hoId);
        } else {
            html = this.generateFullReport();
        }
        const blob = new Blob([html], { type: 'text/html' });
        const filename = `${this.project.name || 'rapport'}_${type}.html`;
        await this.saveWithPicker(blob, filename, [{ description: 'HTML bestanden', accept: { 'text/html': ['.html'] } }]);
    }

    async exportPDF() {
        const type = document.querySelector('input[name="export-type"]:checked').value;
        let html;
        if (type === 'handover') {
            const hoId = document.getElementById('export-handover-id').value;
            html = this.generateHandoverReport(hoId);
        } else {
            html = this.generateFullReport();
        }
        // Inject an auto-print snippet that fires once fonts and images are ready.
        // Uses window.print() so the user picks "Save as PDF" from the native dialog.
        const autoPrint = `<script>(function(){
            function ready(){ try { window.focus(); window.print(); } catch(e){} }
            function whenImages(cb){
                var imgs = Array.from(document.images);
                if (!imgs.length) return cb();
                var left = imgs.length;
                var done = function(){ if (--left <= 0) cb(); };
                imgs.forEach(function(img){
                    if (img.complete) done();
                    else { img.addEventListener('load', done); img.addEventListener('error', done); }
                });
            }
            if (document.fonts && document.fonts.ready) {
                document.fonts.ready.then(function(){ whenImages(function(){ setTimeout(ready, 100); }); });
            } else {
                window.addEventListener('load', function(){ whenImages(function(){ setTimeout(ready, 100); }); });
            }
        })();<\/script></body>`;
        const printable = html.replace('</body>', autoPrint);
        const w = window.open('', '_blank');
        if (!w) {
            this.showNotification(this.t('msg_popup_blocked'), 'error');
            return;
        }
        w.document.open();
        w.document.write(printable);
        w.document.close();
    }

    // =====================================================
    // BCF 2.1 EXPORT — buildingSMART BIM Collaboration Format
    // Produces a .bcfzip that BIMcollab / Revit / Solibri can import.
    // Each ticket becomes a Topic; description becomes the Comment; photos are attached
    // as viewpoint snapshots. No IFC coordinates (OFS is 2D-only), so viewpoints are omitted.
    // =====================================================
    async exportBCF() {
        if (!this.tickets.length) { this.showNotification(this.t('bcf_no_tickets'), 'error'); return; }
        const files = [];
        const enc = new TextEncoder();

        // bcf.version
        files.push({
            name: 'bcf.version',
            data: enc.encode(`<?xml version="1.0" encoding="UTF-8"?>\n<Version VersionId="2.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n  <DetailedVersion>2.1</DetailedVersion>\n</Version>\n`)
        });

        const priorityMap = { high: 'High', medium: 'Normal', low: 'Low' };
        const statusMap = { open: 'Open', assigned: 'InProgress', completed: 'Closed', verified: 'Closed', archived: 'Closed' };
        const xmlEsc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const guidFor = (id) => {
            // Deterministic GUID-like string from ticket id — BCF expects UUIDs but tools accept 22-36 char slugs.
            const s = (id || '').replace(/[^a-z0-9]/gi, '');
            const pad = (s + '00000000000000000000000000000000').slice(0, 32);
            return `${pad.slice(0,8)}-${pad.slice(8,12)}-${pad.slice(12,16)}-${pad.slice(16,20)}-${pad.slice(20,32)}`;
        };
        const dataUrlToBytes = (dataUrl) => {
            const b64 = (dataUrl || '').split(',')[1] || '';
            const bin = atob(b64);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return arr;
        };
        const projectName = this.project.name || 'Field Workspace Project';
        const author = this.project.surveyor || 'fieldworkspace@local';

        for (const t of this.tickets) {
            const topicGuid = guidFor(t.id);
            const created = t.createdAt || new Date().toISOString();
            const status = statusMap[t.status] || 'Open';
            const prio = priorityMap[t.priority] || 'Normal';
            const dl = t.deadline ? `\n    <DueDate>${xmlEsc(t.deadline)}T00:00:00</DueDate>` : '';
            const assigned = t.assignedTo ? `\n    <AssignedTo>${xmlEsc(t.assignedTo)}</AssignedTo>` : '';
            const desc = t.description ? `\n    <Description>${xmlEsc(t.description)}</Description>` : '';
            const commentXml = t.description ? `\n  <Comment Guid="${guidFor(t.id + 'cmt')}">\n    <Date>${created}</Date>\n    <Author>${xmlEsc(author)}</Author>\n    <Comment>${xmlEsc(t.description)}</Comment>\n  </Comment>` : '';

            const markup = `<?xml version="1.0" encoding="UTF-8"?>\n<Markup xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n  <Topic Guid="${topicGuid}" TopicStatus="${status}" TopicType="Issue">\n    <ReferenceLink>${xmlEsc(projectName)}</ReferenceLink>\n    <Title>${xmlEsc(t.label || 'Ticket')}</Title>\n    <Priority>${prio}</Priority>\n    <CreationDate>${created}</CreationDate>\n    <CreationAuthor>${xmlEsc(author)}</CreationAuthor>${dl}${assigned}${desc}\n  </Topic>${commentXml}\n</Markup>\n`;
            files.push({ name: `${topicGuid}/markup.bcf`, data: enc.encode(markup) });

            // Attach photos as viewpoint snapshots (JPEG expected; strip data URL prefix).
            (t.photos || []).forEach((ph, idx) => {
                if (!ph.data || !ph.data.startsWith('data:image/')) return;
                const ext = ph.data.startsWith('data:image/png') ? 'png' : 'jpg';
                files.push({ name: `${topicGuid}/snapshot_${idx + 1}.${ext}`, data: dataUrlToBytes(ph.data) });
            });
        }

        // project.bcfp (project descriptor — optional but improves tool compatibility)
        const projGuid = guidFor((this.project.number || projectName) + 'proj');
        files.push({
            name: 'project.bcfp',
            data: enc.encode(`<?xml version="1.0" encoding="UTF-8"?>\n<ProjectExtension>\n  <Project ProjectId="${projGuid}">\n    <Name>${xmlEsc(projectName)}</Name>\n  </Project>\n  <ExtensionSchema>extensions.xsd</ExtensionSchema>\n</ProjectExtension>\n`)
        });

        const zipBlob = this._makeZip(files);
        const filename = `${(projectName || 'project').replace(/[^\w-]+/g, '_')}.bcfzip`;
        await this.saveWithPicker(zipBlob, filename, [{ description: 'BCF ZIP', accept: { 'application/zip': ['.bcfzip', '.zip'] } }]);
        this.logActivity(this.tFormat('act_bcf_exported', this.tickets.length));
    }

    // Minimal ZIP writer (STORE / no compression). Handles small BCF payloads fine.
    _makeZip(files) {
        // CRC-32 table lazy-init
        if (!this._crcTable) {
            const t = new Uint32Array(256);
            for (let n = 0; n < 256; n++) {
                let c = n;
                for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
                t[n] = c;
            }
            this._crcTable = t;
        }
        const crc32 = (bytes) => {
            let c = 0xFFFFFFFF;
            for (let i = 0; i < bytes.length; i++) c = this._crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
            return (c ^ 0xFFFFFFFF) >>> 0;
        };
        const encoder = new TextEncoder();
        const parts = [];
        const central = [];
        let offset = 0;

        for (const f of files) {
            const nameBytes = encoder.encode(f.name);
            const data = f.data instanceof Uint8Array ? f.data : encoder.encode(String(f.data));
            const crc = crc32(data);
            const size = data.length;

            const lfh = new Uint8Array(30 + nameBytes.length);
            const lv = new DataView(lfh.buffer);
            lv.setUint32(0, 0x04034b50, true);
            lv.setUint16(4, 20, true);      // version needed
            lv.setUint16(6, 0, true);       // flags
            lv.setUint16(8, 0, true);       // method: STORE
            lv.setUint16(10, 0, true);      // mod time
            lv.setUint16(12, 0x21, true);   // mod date (Jan 1, 1980+ arbitrary)
            lv.setUint32(14, crc, true);
            lv.setUint32(18, size, true);   // compressed
            lv.setUint32(22, size, true);   // uncompressed
            lv.setUint16(26, nameBytes.length, true);
            lv.setUint16(28, 0, true);
            lfh.set(nameBytes, 30);
            parts.push(lfh, data);

            const cdh = new Uint8Array(46 + nameBytes.length);
            const cv = new DataView(cdh.buffer);
            cv.setUint32(0, 0x02014b50, true);
            cv.setUint16(4, 20, true);
            cv.setUint16(6, 20, true);
            cv.setUint16(8, 0, true);
            cv.setUint16(10, 0, true);
            cv.setUint16(12, 0, true);
            cv.setUint16(14, 0x21, true);
            cv.setUint32(16, crc, true);
            cv.setUint32(20, size, true);
            cv.setUint32(24, size, true);
            cv.setUint16(28, nameBytes.length, true);
            cv.setUint16(30, 0, true);
            cv.setUint16(32, 0, true);
            cv.setUint16(34, 0, true);
            cv.setUint16(36, 0, true);
            cv.setUint32(38, 0, true);
            cv.setUint32(42, offset, true);
            cdh.set(nameBytes, 46);
            central.push(cdh);
            offset += lfh.length + size;
        }

        const cdOffset = offset;
        let cdSize = 0;
        for (const c of central) cdSize += c.length;

        const eocd = new Uint8Array(22);
        const ev = new DataView(eocd.buffer);
        ev.setUint32(0, 0x06054b50, true);
        ev.setUint16(4, 0, true);
        ev.setUint16(6, 0, true);
        ev.setUint16(8, files.length, true);
        ev.setUint16(10, files.length, true);
        ev.setUint32(12, cdSize, true);
        ev.setUint32(16, cdOffset, true);
        ev.setUint16(20, 0, true);

        return new Blob([...parts, ...central, eocd], { type: 'application/zip' });
    }

    generateFullReport() {
        const incPhotos = document.getElementById('include-photos').checked;
        const incMap = document.getElementById('include-map').checked;
        const byFloor = {};
        this.tickets.forEach(t => { if (!byFloor[t.floorPlanId]) byFloor[t.floorPlanId] = []; byFloor[t.floorPlanId].push(t); });

        return `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${this.esc(this.project.name||'Rapport')} - Field Workspace</title>
<style>:root{--amber:#121212;--night:#121212;--bg:#EEEEEE;--surface:#fff;--border:#dddddd;--gray:#555555;--font-body:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI Variable','Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;--font-display:'Space Grotesk','Segoe UI Variable Display','Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,sans-serif;}*{box-sizing:border-box;margin:0;padding:0;}body{font-family:var(--font-body);background:var(--bg);color:var(--night);line-height:1.6;}.container{max-width:1100px;margin:0 auto;padding:2rem;}header{background:var(--night);padding:1.5rem 0;}header .container{display:flex;align-items:center;justify-content:space-between;}header h1{font-family:var(--font-display);color:#fff;font-size:1.5rem;}header span{color:var(--gray);}.section{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:2rem;margin-bottom:2rem;}.section h3{font-family:var(--font-display);font-size:1.5rem;margin-bottom:1rem;border-bottom:2px solid var(--border);padding-bottom:0.5rem;}.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;}.meta-item{padding:0.75rem;background:var(--bg);border-radius:8px;}.meta-item label{display:block;font-size:0.75rem;color:var(--gray);}.meta-item span{font-weight:500;}.ticket-card{border:1px solid var(--border);border-radius:8px;padding:1rem;margin-bottom:1rem;}.ticket-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;}.ticket-badge{padding:0.15em 0.5em;border-radius:999px;font-size:0.7rem;font-weight:600;}.tb-open{background:rgba(217,119,6,0.15);color:#B45309;}.tb-assigned{background:rgba(37,99,235,0.15);color:#1D4ED8;}.tb-completed{background:rgba(22,163,74,0.15);color:#15803D;}.tb-verified{background:rgba(161,161,170,0.15);color:#71717A;}.photos-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:0.5rem;margin-top:0.5rem;}.photo-fig{margin:0;display:flex;flex-direction:column;}.photos-grid img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;border:1px solid var(--border);}.photo-cap{font-size:0.65rem;color:var(--gray);font-family:monospace;margin-top:0.15rem;word-break:break-all;line-height:1.2;}footer{text-align:center;padding:2rem;color:var(--gray);font-size:0.8rem;}@page{size:A4;margin:15mm;}@media print{html,body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;}header{background:#000000 !important;padding:0.75rem 0;}.container{max-width:none;padding:0;}main.container{padding:0;}.section{background:#fff;border:1px solid #E7E5E4;border-radius:8px;padding:1rem;margin-bottom:0.75rem;break-inside:avoid;page-break-inside:avoid;box-shadow:none;}.section h2,.section h3{font-size:1.1rem;margin-bottom:0.4rem;padding-bottom:0.25rem;}.ticket-card{padding:0.5rem;margin-bottom:0.5rem;break-inside:avoid;page-break-inside:avoid;}.photos-grid{grid-template-columns:repeat(4,1fr);gap:0.25rem;}.photos-grid img{max-height:80px;object-fit:cover;}.meta{gap:0.5rem;}.meta-item{padding:0.4rem;}footer{padding:0.5rem;font-size:0.7rem;}}</style></head><body>
<header><div class="container"><div><h1>FW · Field Workspace</h1><small style="color:#999999">Spanvision Infra</small></div><span>${new Date().toLocaleDateString('en-GB')}</span></div></header>
<main class="container"><div class="section"><h2 style="font-family:'Space Grotesk';font-size:2rem;margin-bottom:1rem;">${this.esc(this.project.name||'Projectrapport')}</h2><div class="meta">
${this.project.number?`<div class="meta-item"><label>Projectnummer</label><span>${this.esc(this.project.number)}</span></div>`:''}
<div class="meta-item"><label>Adres</label><span>${this.esc(this.project.address)}, ${this.esc(this.project.postalCode)} ${this.esc(this.project.city)}</span></div>
${this.project.bagData?.nummeraanduidingId?`<div class="meta-item"><label>BAG-geverifieerd</label><span style="font-family:monospace;font-size:0.8rem;">Nr.aand.: ${this.esc(this.project.bagData.nummeraanduidingId)}${this.project.bagData.pandId?'<br>Pand: '+this.esc(this.project.bagData.pandId):''}</span></div>`:''}
${this.project.energyLabel?.label?`<div class="meta-item"><label>Energielabel</label><span style="font-weight:700;font-size:1.1rem;">${this.esc(this.project.energyLabel.label)}</span>${this.project.energyLabel.opnamedatum?`<br><span style="font-size:0.75rem;color:var(--gray);">opname ${this.esc(this.project.energyLabel.opnamedatum)}</span>`:''}</div>`:''}
${this.project.client?`<div class="meta-item"><label>Opdrachtgever</label><span>${this.esc(this.project.client)}</span></div>`:''}
${this.project.surveyDate?`<div class="meta-item"><label>Opnamedatum</label><span>${this.esc(this.project.surveyDate)}</span></div>`:''}
${this.project.surveyor?`<div class="meta-item"><label>Opgenomen door</label><span>${this.esc(this.project.surveyor)}</span></div>`:''}
</div>${this.project.description?`<p style="margin-top:1rem;color:var(--gray);">${this.esc(this.project.description)}</p>`:''}</div>
${this.floorPlans.map(fp => {
    const pts = byFloor[fp.id] || [];
    return `<div class="section"><h3>${this.esc(fp.name)}</h3>
    ${incMap?`<div style="position:relative;display:inline-block;max-width:100%;margin-bottom:1rem;"><img src="${fp.data}" style="max-width:100%;border-radius:8px;border:1px solid var(--border);">
    ${pts.map((p,i)=>`<div style="position:absolute;left:${p.x}%;top:${p.y}%;width:24px;height:24px;transform:translate(-50%,-100%);"><svg viewBox="0 0 24 24" fill="${{open:'#D97706',assigned:'#2563EB',completed:'#16A34A',verified:'#71717A'}[p.status]||'#D97706'}"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg></div>`).join('')}
    </div>`:''}
    ${pts.length?pts.map((p,i)=>`<div class="ticket-card"><div class="ticket-header"><strong>${i+1}. ${this.esc(p.label)}</strong><span class="ticket-badge tb-${p.status}">${this.statusLabel(p.status)}</span></div>
    <p style="font-size:0.8rem;color:var(--gray);">${p.category||''} · ${this.priorityLabel(p.priority)} · ${this.severityLabel(p.severity)}${p.assignedTo?' · '+this.esc(p.assignedTo):''}${p.deadline?' · Deadline: '+p.deadline:''}</p>
    ${p.description?`<p style="margin-top:0.5rem;">${this.esc(p.description)}</p>`:''}
    ${incPhotos&&p.photos?.length?`<div class="photos-grid">${p.photos.map(ph=>{
        const meta = [];
        if (ph.capturedAt) { const d = new Date(ph.capturedAt); if (!isNaN(d.getTime())) meta.push(d.toLocaleString('en-GB')); }
        if (ph.gps) meta.push(`${ph.gps.lat.toFixed(5)}, ${ph.gps.lon.toFixed(5)}`);
        const cap = meta.length ? `<div class="photo-cap">${this.esc(meta.join(' · '))}</div>` : '';
        return `<figure class="photo-fig"><img src="${ph.data}">${cap}</figure>`;
    }).join('')}</div>`:''}
    </div>`).join(''):'<p style="color:var(--gray);">Geen tickets</p>'}
    </div>`;
}).join('')}
</main><footer><p>Generated with Field Workspace · Spanvision Infra on ${new Date().toLocaleString('en-GB')}</p></footer></body></html>`;
    }

    generateHandoverReport(hoId) {
        const ho = this.handovers.find(h => h.id === hoId);
        if (!ho) return this.generateFullReport();
        return `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Proces-Verbaal van Oplevering - ${this.esc(this.project.name)}</title>
<style>:root{--font-body:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI Variable','Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;--font-display:'Space Grotesk','Segoe UI Variable Display','Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,sans-serif;}*{box-sizing:border-box;margin:0;padding:0;}body{font-family:var(--font-body);color:#36363E;line-height:1.6;padding:2rem;max-width:900px;margin:0 auto;}h1{font-family:var(--font-display);font-size:1.8rem;margin-bottom:0.5rem;}h2{font-family:var(--font-display);font-size:1.3rem;margin:1.5rem 0 0.75rem;border-bottom:2px solid #E7E5E4;padding-bottom:0.5rem;}.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:1.5rem;}.meta-row{display:flex;gap:0.5rem;}.meta-label{font-weight:600;min-width:140px;font-size:0.85rem;color:#A1A1AA;}.meta-val{font-size:0.85rem;}table{width:100%;border-collapse:collapse;margin:1rem 0;}th,td{border:1px solid #E7E5E4;padding:0.5rem 0.75rem;text-align:left;font-size:0.85rem;}th{background:#F5F5F4;font-weight:600;}.verdict-ok{color:#16A34A;font-weight:600;}.verdict-cond{color:#F59E0B;font-weight:600;}.verdict-nok{color:#DC2626;font-weight:600;}.sig-block{display:inline-block;width:45%;margin:1rem 2%;vertical-align:top;}.sig-block img{max-width:100%;border:1px solid #E7E5E4;border-radius:4px;}@page{size:A4;margin:15mm;}@media print{html,body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:0;}body{padding:0;max-width:none;}h2{margin:0.75rem 0 0.4rem;font-size:1.05rem;}table{page-break-inside:avoid;}.sig-block{page-break-inside:avoid;}}</style></head><body>
<h1>Proces-Verbaal van Oplevering</h1>
<p style="color:#A1A1AA;margin-bottom:2rem;">${this.hoTypeLabel(ho.type)} · ${ho.date}</p>
<h2>Projectgegevens</h2>
<div class="meta-grid">
<div class="meta-row"><span class="meta-label">Project:</span><span class="meta-val">${this.esc(this.project.name)}</span></div>
<div class="meta-row"><span class="meta-label">Projectnummer:</span><span class="meta-val">${this.esc(this.project.number)}</span></div>
<div class="meta-row"><span class="meta-label">Adres:</span><span class="meta-val">${this.esc(this.project.address)}, ${this.esc(this.project.postalCode)} ${this.esc(this.project.city)}</span></div>
${this.project.bagData?.nummeraanduidingId?`<div class="meta-row"><span class="meta-label">BAG-ID:</span><span class="meta-val" style="font-family:monospace;font-size:0.75rem;">${this.esc(this.project.bagData.nummeraanduidingId)}</span></div>`:''}
<div class="meta-row"><span class="meta-label">Opdrachtgever:</span><span class="meta-val">${this.esc(this.project.client)}</span></div>
<div class="meta-row"><span class="meta-label">Datum oplevering:</span><span class="meta-val">${ho.date}</span></div>
</div>
<h2>Deelnemers</h2>
<table><tr><th>Naam</th><th>Rol</th><th>Bedrijf</th></tr>
${(ho.participants||[]).map(p=>`<tr><td>${this.esc(p.name)}</td><td>${this.esc(p.role)}</td><td>${this.esc(p.company||'')}</td></tr>`).join('')}
</table>
<h2>Opleverpunten</h2>
<table><tr><th>#</th><th>Punt</th><th>Categorie</th><th>Prioriteit</th><th>Oordeel</th></tr>
${ho.items.map((item,i)=>{const t=this.tickets.find(tk=>tk.id===item.ticketId);if(!t)return'';const vc=item.verdict==='approved'?'verdict-ok':item.verdict==='conditional'?'verdict-cond':'verdict-nok';const vl=item.verdict==='approved'?"Approved":item.verdict==='conditional'?'Onder voorbehoud':item.verdict==='rejected'?"Rejected":"Not assessed";return`<tr><td>${i+1}</td><td>${this.esc(t.label)}</td><td>${t.category||''}</td><td>${this.priorityLabel(t.priority)}</td><td class="${vc}">${vl}</td></tr>`;}).join('')}
</table>
<h2>Eindoordeel</h2>
<p style="font-size:1.2rem;font-weight:700;color:${ho.verdict==='approved'?'#16A34A':ho.verdict==='conditional'?'#F59E0B':'#DC2626'}">${ho.verdict==='approved'?"APPROVED":ho.verdict==='conditional'?"APPROVED WITH CONDITIONS":"REJECTED"}</p>
${ho.notes?`<p style="margin-top:0.5rem;">${this.esc(ho.notes)}</p>`:''}
<h2>Handtekeningen</h2>
${(ho.signatures||[]).map(s=>`<div class="sig-block"><p><strong>${this.esc(s.name)}</strong> (${this.esc(s.role)})</p><p style="font-size:0.8rem;color:#A1A1AA;">${new Date(s.date).toLocaleString('en-GB')}</p><img src="${s.data}" alt="Handtekening"></div>`).join('')}
<hr style="margin:2rem 0;border:none;border-top:1px solid #E7E5E4;">
<p style="text-align:center;font-size:0.75rem;color:#A1A1AA;">Generated with Field Workspace · Spanvision Infra on ${new Date().toLocaleString('en-GB')}</p>
</body></html>`;
    }

    // =====================================================
    // SAVE/LOAD
    // =====================================================
    async saveJSON() {
        const data = { version:'2.0', exportDate:new Date().toISOString(), project:this.project, contacts:this.contacts, floorPlans:this.floorPlans, tickets:this.tickets, inspections:this.inspections, handovers:this.handovers, checklistTemplates:this.checklistTemplates, activityLog:this.activityLog };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
        const filename = `${this.project.name||'project'}_fw.json`;
        await this.saveWithPicker(blob, filename, [{ description: 'JSON bestanden', accept: { 'application/json': ['.json'] } }]);
    }

    loadJSON(e) {
        // Tauri native open dialog
        if (window.__tauriDialog && window.__tauriFs && (!e || !e.target || !e.target.files)) {
            this.loadJSONTauri();
            return;
        }
        const file = e.target.files[0]; if (!file) return;
        const r = new FileReader();
        r.onload = (ev) => { this.applyLoadedJSON(ev.target.result); };
        r.onerror = () => this.showNotification(this.t('msg_load_error'), 'error');
        r.readAsText(file); e.target.value = '';
    }

    async loadJSONTauri() {
        try {
            const path = await window.__tauriDialog.open({
                filters: [{ name: 'JSON', extensions: ['json'] }],
                multiple: false
            });
            if (!path) return;
            const text = await window.__tauriFs.readTextFile(path);
            this.applyLoadedJSON(text);
        } catch (e) {
            if (e && e.toString().includes('cancelled')) return;
            this.showNotification(this.t('msg_load_error'), 'error');
            console.error(e);
        }
    }

    validateLoadedJSON(data) {
        const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
        if (!isRecord(data) || !isRecord(data.project)) throw new Error('Invalid project document');
        const collections = ['contacts', 'floorPlans', 'locationPoints', 'tickets', 'inspections', 'handovers', 'checklistTemplates', 'activityLog'];
        for (const key of collections) {
            if (!(key in data)) continue;
            if (!Array.isArray(data[key]) || data[key].some(item => !isRecord(item))) {
                throw new Error(`Invalid project collection: ${key}`);
            }
            for (const item of data[key]) {
                for (const nested of ['photos', 'comments', 'history', 'items', 'signatures']) {
                    if (nested in item && (!Array.isArray(item[nested]) || item[nested].some(value => !isRecord(value)))) {
                        throw new Error(`Invalid project collection: ${key}.${nested}`);
                    }
                }
            }
        }
    }

    applyLoadedJSON(text) {
        const fields = ['project', 'contacts', 'floorPlans', 'tickets', 'inspections', 'handovers', 'checklistTemplates', 'activityLog'];
        let previous;
        try {
            const d = JSON.parse(text);
            // Validate the complete input before replacing any active data.
            // Otherwise a late rendering error could leave half a project imported.
            this.validateLoadedJSON(d);
            previous = Object.fromEntries(fields.map(key => [key, this[key]]));
            if (d.project) this.project = d.project;
            if (d.contacts) this.contacts = d.contacts;
            if (d.floorPlans) this.floorPlans = d.floorPlans;
            if (d.locationPoints) this.tickets = d.locationPoints;
            if (d.tickets) this.tickets = d.tickets;
            if (d.inspections) this.inspections = d.inspections;
            if (d.handovers) this.handovers = d.handovers;
            if (d.checklistTemplates) this.checklistTemplates = d.checklistTemplates;
            if (d.activityLog) this.activityLog = d.activityLog;
            this.loadProjectForm(); this.renderContacts(); this.renderFloorPlansList(); this.updateFloorPlanSelector(); this.saveToLocalStorage();
            this.showNotification(this.t('msg_loaded'), 'success');
            return true;
        } catch(err) {
            if (previous) {
                for (const key of fields) this[key] = previous[key];
                this.loadProjectForm(); this.renderContacts(); this.renderFloorPlansList(); this.updateFloorPlanSelector();
            }
            this.showNotification(this.t('msg_load_error'), 'error'); console.error(err);
            return false;
        }
    }

    // =====================================================
    // IFC 3D VIEWER (lazy-load Three.js + web-ifc on first use)
    // =====================================================
    async loadIfcFile(file) {
        const status = document.getElementById('ifc-status');
        const container = document.getElementById('ifc-canvas-container');
        if (!status || !container) return;
        status.textContent = this.tFormat('ifc_loading', file.name);
        status.style.color = 'var(--text-muted, #6b7280)';
        try {
            if (!window.__fwIfcViewer) {
                if (typeof window.__fwLoadIfcViewer !== 'function') throw new Error('IFC-loader ontbreekt');
                await window.__fwLoadIfcViewer();
            }
            const buf = await file.arrayBuffer();
            const { meshCount } = await window.__fwIfcViewer.loadIfcArrayBuffer(container, buf);
            status.textContent = this.tFormat('ifc_ok', file.name, meshCount);
            status.style.color = 'var(--success, #059669)';
            this.logActivity(this.tFormat('act_ifc_loaded', file.name, meshCount));
        } catch (err) {
            console.error('IFC load error', err);
            status.textContent = this.tFormat('ifc_error', err.message || err);
            status.style.color = 'var(--danger, #dc2626)';
        }
    }

    // =====================================================
    // BLOB STORE — IndexedDB
    // Large binaries (photos, floor plans, signatures) live here, keyed by blobRef.
    // localStorage holds only metadata + refs (< 5MB), IDB holds the payloads (GBs).
    // =====================================================
    _blobDb() {
        if (this._blobDbP) return this._blobDbP;
        this._blobDbP = new Promise((res, rej) => {
            const req = indexedDB.open('ofs-blobs', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('blobs');
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
        return this._blobDbP;
    }
    async _blobPut(key, dataUrl) {
        const db = await this._blobDb();
        return new Promise((res, rej) => {
            const tx = db.transaction('blobs', 'readwrite');
            tx.objectStore('blobs').put(dataUrl, key);
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error);
        });
    }
    async _blobGet(key) {
        const db = await this._blobDb();
        return new Promise((res, rej) => {
            const tx = db.transaction('blobs', 'readonly');
            const r = tx.objectStore('blobs').get(key);
            r.onsuccess = () => res(r.result || null);
            r.onerror = () => rej(r.error);
        });
    }
    async _blobClearAll() {
        const db = await this._blobDb();
        return new Promise((res, rej) => {
            const tx = db.transaction('blobs', 'readwrite');
            tx.objectStore('blobs').clear();
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error);
        });
    }

    // Walk `node` recursively; for every plain object shaped like { data: "data:..." },
    // ensure it has a blobRef, write the payload to IDB (fire-and-forget), and return a
    // shallow clone with `data` stripped. Non-blob values pass through unchanged.
    _stripBlobs(node, pending) {
        if (Array.isArray(node)) return node.map(v => this._stripBlobs(v, pending));
        if (node && typeof node === 'object') {
            const isBlob = typeof node.data === 'string' && node.data.startsWith('data:');
            const out = {};
            for (const k of Object.keys(node)) {
                if (k === 'data' && isBlob) continue;
                out[k] = this._stripBlobs(node[k], pending);
            }
            if (isBlob) {
                if (!node.blobRef) node.blobRef = 'b_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
                out.blobRef = node.blobRef;
                pending.push(this._blobPut(node.blobRef, node.data));
            }
            return out;
        }
        return node;
    }

    // Walk `node` recursively; for every object with { blobRef, no data }, resolve
    // the blobRef from IDB and set `data`. Missing blobs stay unresolved (skipped by UI).
    async _hydrateBlobs(node) {
        if (Array.isArray(node)) { await Promise.all(node.map(v => this._hydrateBlobs(v))); return; }
        if (node && typeof node === 'object') {
            if (node.blobRef && typeof node.data !== 'string') {
                try { const d = await this._blobGet(node.blobRef); if (d) node.data = d; }
                catch (e) { console.warn('blob resolve failed', node.blobRef, e); }
            }
            for (const k of Object.keys(node)) await this._hydrateBlobs(node[k]);
        }
    }

    saveToLocalStorage() {
        const pending = [];
        const stripped = this._stripBlobs({
            project:this.project, contacts:this.contacts, floorPlans:this.floorPlans, tickets:this.tickets,
            inspections:this.inspections, handovers:this.handovers, checklistTemplates:this.checklistTemplates, activityLog:this.activityLog
        }, pending);
        try {
            localStorage.setItem('openFieldStudio', JSON.stringify(stripped));
        } catch (e) {
            console.error('localStorage full even after blob-strip', e);
            this.showNotification(this.t('msg_storage_full'), 'error');
        }
        // Blob writes to IDB proceed in the background — safe to fire-and-forget for auto-save.
        if (pending.length) Promise.all(pending).catch(err => console.warn('blob write failed', err));
        this._lastSaved = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        this.updateStatusBar();
    }

    async loadFromLocalStorage() {
        try {
            const saved = localStorage.getItem('openFieldStudio');
            if (!saved) return;
            const d = JSON.parse(saved);
            await this._hydrateBlobs(d);
            this.project = d.project || this.project;
            this.contacts = d.contacts || [];
            this.floorPlans = (d.floorPlans || []).filter(fp => fp.data && fp.data.startsWith('data:image'));
            this.tickets = d.tickets || d.locationPoints || [];
            this.inspections = d.inspections || [];
            this.handovers = d.handovers || [];
            // Merge saved templates with defaults: remove old split energie templates, add new defaults
            if (d.checklistTemplates?.length) {
                const obsolete = ['tpl_energie_schil','tpl_energie_installatie','tpl_energie_woning'];
                const cleaned = d.checklistTemplates.filter(t => !obsolete.includes(t.id));
                const savedIds = cleaned.map(t => t.id);
                const defaults = this.getDefaultTemplates();
                const newDefaults = defaults.filter(t => !savedIds.includes(t.id));
                this.checklistTemplates = [...cleaned, ...newDefaults];
            }
            this.activityLog = d.activityLog || [];
            this.loadProjectForm(); this.renderContacts(); this.renderFloorPlansList(); this.updateFloorPlanSelector();
        } catch(err) { console.error('localStorage load error:', err); localStorage.removeItem('openFieldStudio'); }
    }

    async clearLocalStorage() {
        const ok = await this.asyncConfirm(this.t('msg_confirm_clear'));
        if (!ok) return;
        localStorage.removeItem('openFieldStudio');
        try { await this._blobClearAll(); } catch (e) { console.warn('IDB clear failed', e); }
        this.project = { name:'',number:'',client:'',contactPerson:'',address:'',postalCode:'',city:'',surveyDate:'',surveyor:'',description:'',notes:'',bagData:null };
        this.contacts = []; this.floorPlans = []; this.tickets = []; this.inspections = []; this.handovers = []; this.activityLog = [];
        this.activeFloorPlanId = null;
        this.loadProjectForm(); this.renderContacts(); this.renderFloorPlansList(); this.updateFloorPlanSelector(); this.clearCanvas(); this.setDefaultDate();
        this.showNotification(this.t('msg_cleared'), 'success');
    }

    validateAndCleanData() {
        let dirty = false;
        const valid = this.floorPlans.filter(fp => { if (!fp.data || typeof fp.data !== 'string' || !fp.data.startsWith('data:image/')) { dirty = true; return false; } const b = fp.data.split(',')[1]; if (!b || b.length < 100) { dirty = true; return false; } return true; });
        if (dirty) { this.floorPlans = valid; const ids = valid.map(fp => fp.id); this.tickets = this.tickets.filter(t => ids.includes(t.floorPlanId)); this.renderFloorPlansList(); this.updateFloorPlanSelector(); this.saveToLocalStorage(); setTimeout(() => this.showNotification(this.t('msg_corrupt'), 'error'), 500); }
    }

    // =====================================================
    // UTILITIES
    // =====================================================
    genId() { return 'id_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now(); }
    esc(text) { if (!text) return ''; const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }

    // Async confirm dialog — uses Tauri native dialog or custom HTML modal
    asyncConfirm(message) {
        // Try Tauri native dialog
        if (window.__tauriDialog && window.__tauriDialog.ask) {
            return window.__tauriDialog.ask(message, { title: 'Field Workspace', kind: 'warning' });
        }
        // Custom HTML modal confirm
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;animation:modalFadeIn 0.15s ease;';
            const box = document.createElement('div');
            box.style.cssText = 'background:var(--surface,#fff);border-radius:12px;padding:24px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);font-family:Inter,sans-serif;';
            box.innerHTML = `<p style="margin:0 0 20px;font-size:0.95rem;color:var(--text-primary,#333);line-height:1.5;">${this.esc(message)}</p>
                <div style="display:flex;gap:12px;justify-content:flex-end;">
                    <button id="_confirm_no" style="padding:8px 20px;border:2px solid var(--deep-forge,#36363E);background:transparent;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.9rem;font-family:inherit;color:var(--text-primary,#333);">${this.t('btn_cancel')}</button>
                    <button id="_confirm_yes" style="padding:8px 20px;border:none;background:#DC2626;color:#fff;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.9rem;font-family:inherit;">${this.t('btn_remove')}</button>
                </div>`;
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            box.querySelector('#_confirm_yes').focus();
            box.querySelector('#_confirm_yes').onclick = () => { overlay.remove(); resolve(true); };
            box.querySelector('#_confirm_no').onclick = () => { overlay.remove(); resolve(false); };
            overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
            document.addEventListener('keydown', function handler(e) {
                if (e.key === 'Escape') { overlay.remove(); resolve(false); document.removeEventListener('keydown', handler); }
            });
        });
    }

    async saveWithPicker(blob, filename, fileTypes) {
        // Tauri native dialog
        if (window.__tauriDialog && window.__tauriFs) {
            try {
                const ext = filename.split('.').pop() || 'json';
                const filters = fileTypes.map(ft => ({
                    name: ft.description || 'File',
                    extensions: Object.values(ft.accept).flat().map(e => e.replace('.', ''))
                }));
                const path = await window.__tauriDialog.save({ defaultPath: filename, filters });
                if (!path) return; // User cancelled
                const text = await blob.text();
                await window.__tauriFs.writeTextFile(path, text);
                this.showNotification(this.t('msg_json_saved'), 'success');
                return;
            } catch (e) {
                if (e && e.toString().includes('cancelled')) return;
                console.error('Tauri save error:', e);
            }
        }
        // Browser: File System Access API
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({ suggestedName: filename, types: fileTypes });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                this.showNotification(this.t('msg_json_saved'), 'success');
                return;
            } catch (e) {
                if (e.name === 'AbortError') return;
            }
        }
        // Fallback: direct download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename;
        a.click(); URL.revokeObjectURL(url);
        this.showNotification(this.t('msg_json_downloaded'), 'success');
    }

    showNotification(msg, type = 'info') {
        const n = document.createElement('div');
        n.className = 'notification';
        n.dataset.status = type;
        n.setAttribute('role', type === 'error' ? 'alert' : 'status');
        n.style.cssText = `position:fixed;bottom:2rem;right:2rem;padding:1rem 1.5rem;background:${type==='success'?'#16A34A':type==='error'?'#DC2626':'#D97706'};color:#fff;border-radius:8px;font-family:'Inter',sans-serif;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:9999;animation:slideIn 0.3s ease;`;
        n.textContent = msg; document.body.appendChild(n);
        setTimeout(() => { n.style.animation = 'fadeOut 0.3s ease'; setTimeout(() => n.remove(), 300); }, 3000);
    }
}

// Animations
const style = document.createElement('style');
style.textContent = `@keyframes slideIn{from{transform:translateX(100px);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes fadeOut{from{opacity:1}to{opacity:0}}`;
document.head.appendChild(style);

// Expose class globally — initialization is handled by main.tsx after i18next is ready
window.FieldWorkspace = FieldWorkspace;
