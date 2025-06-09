// app.js

// 先宣告後端三個服務的 base URL server
const AUTH_BASE    = '/auth';
const API_BASE     = '/customer_food';
const RECORD_BASE  = '/diet_record';

// local
//const AUTH_BASE    = 'http://127.0.0.1:5001';
//const API_BASE     = 'http://127.0.0.1:1122';
//const RECORD_BASE  = 'http://127.0.0.1:1133';


// 建立 axios 實例，自動攜帶 Cookie（Session）
const httpAuth   = axios.create({ baseURL: AUTH_BASE,    withCredentials: true });
const httpFood   = axios.create({ baseURL: API_BASE,     withCredentials: true });
const httpRecord = axios.create({ baseURL: RECORD_BASE, withCredentials: true });

// ------------------------------
// 1. 簡易中央狀態管理器 (Store)
// ------------------------------
const store = Vue.reactive({
  isLoggedIn: !!localStorage.getItem('username'),
  records: [],
  officialFoods: [],
  customFoods: [],
  dataLoaded: false,

  async fetchAllSharedData() {
    if (!this.isLoggedIn || this.dataLoaded) return;
    try {
      const uid = localStorage.getItem('userId');
      const [ofResp, cfResp, recResp] = await Promise.all([
        httpRecord.get('/official-foods'),
        httpFood.get('/customer-foods', { params: { user_id: uid } }),
        httpRecord.get('/diet-records')
      ]);
      this.officialFoods = ofResp.data;
      this.customFoods   = cfResp.data;
      this.records       = recResp.data.sort((a,b)=>new Date(b.record_time)-new Date(a.record_time));
      this.dataLoaded    = true;
    } catch (e) {
      console.error("Failed to fetch shared data:", e);
      this.logoutCleanup();
    }
  },

  setLoginStatus(status) {
    this.isLoggedIn = status;
    if (!status) this.logoutCleanup();
  },

  logoutCleanup() {
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    this.isLoggedIn   = false;
    this.records      = [];
    this.officialFoods= [];
    this.customFoods  = [];
    this.dataLoaded   = false;
  }
});

// ------------------------------
// 2. Login 元件
// ------------------------------
const Login = {
  template: '#login-template',
  inject: ['store'],
  data() {
    return { username:'', password:'', message:'' };
  },
  methods: {
    removeReadonly(e) { e.target.removeAttribute('readonly'); },
    async doLogin() {
      if (!this.username || !this.password) {
        this.message = '請輸入帳號與密碼。'; return;
      }
      try {
        await httpAuth.post('/login', {
          username: this.username,
          password: this.password
        });
        const who = await httpAuth.get('/whoami');
        if (who.data.logged_in) {
          localStorage.setItem('userId', who.data.user_id);
          localStorage.setItem('username', who.data.username);
          this.store.setLoginStatus(true);
          this.$router.replace('/');
          return;
        }
        this.message = '登入失敗';
      } catch (err) {
        this.message = err.response?.data?.error || '網路錯誤，請稍後再試。';
      }
    }
  }
};

// ------------------------------
// 3. Signup 元件
// ------------------------------
const Signup = {
  template: '#signup-template',
  data() { return { username:'', password:'', message:'' }; },
  methods: {
    removeReadonly(e) { e.target.removeAttribute('readonly'); },
    async doSignup() {
      if (!this.username || !this.password) {
        this.message = '請輸入帳號與密碼。'; return;
      }
      try {
        const resp = await httpAuth.post('/signup', {
          username: this.username,
          password: this.password
        });
        if (resp.status === 201) {
          this.$router.replace({ path:'/login', query:{ msg:'已註冊，請重新登入。' }});
        }
      } catch (err) {
        if (err.response?.status === 409) {
          this.message = '此使用者名稱已被註冊。';
        } else {
          this.message = err.response?.data?.error || '註冊失敗，請稍後再試。';
        }
      }
    }
  },
  mounted() {
    const msg = this.$route.query.msg;
    if (msg) this.message = msg;
  }
};

// ------------------------------
// 4. Dashboard 元件
// ------------------------------
const Dashboard = {
  template: '#dashboard-template',
  inject: ['store'],
  data() {
    return { today:new Date(), targetKcal:2000, error:'' };
  },
  computed: {
    todayFormatted() {
      const y=this.today.getFullYear(), m=String(this.today.getMonth()+1).padStart(2,'0'),
            d=String(this.today.getDate()).padStart(2,'0');
      return `${y}-${m}-${d}`;
    },
    todayRecords() {
      return this.store.records.filter(r=>r.record_time.startsWith(this.todayFormatted));
    },
    todayCalories(){ return this.todayRecords.reduce((s,r)=>s+r.calorie_sum,0); },
    todayCarbs()   { return this.todayRecords.reduce((s,r)=>s+r.carb_sum,0); },
    todayProtein(){ return this.todayRecords.reduce((s,r)=>s+r.protein_sum,0); },
    todayFat()     { return this.todayRecords.reduce((s,r)=>s+r.fat_sum,0); },
    kcalRatio()    { return this.targetKcal ? Math.min(this.todayCalories/this.targetKcal,1) : 0; },
    circleColor()  { return this.todayCalories>this.targetKcal? '#ef5350':'#4caf50'; },
    totalMacro()   { return this.todayCarbs + this.todayProtein + this.todayFat; },
    macroAngles() {
      if (this.totalMacro<=0) return { carbs:0,protein:0,fat:0 };
      const pC=(this.todayCarbs/this.totalMacro)*360,
            pP=(this.todayProtein/this.totalMacro)*360,
            pF=360-pC-pP;
      return { carbs:pC, protein:pP, fat:pF };
    },
    macroPercents() {
      if (this.totalMacro<=0) return { carbs:0,protein:0,fat:0 };
      const pC=Math.round((this.todayCarbs/this.totalMacro)*100),
            pP=Math.round((this.todayProtein/this.totalMacro)*100),
            pF=100-pC-pP;
      return { carbs:pC, protein:pP, fat:pF };
    },
    circumference(){ return 2*Math.PI*54; }
  },
  methods: {
    formatTime(dtStr) {
      const dt=new Date(dtStr.replace(' ','T')), hh=String(dt.getHours()).padStart(2,'0'),
            mi=String(dt.getMinutes()).padStart(2,'0');
      return `${hh}:${mi}`;
    },
    pieSlicePath(s,e,r) {
      const toR=deg=>Math.PI*(deg-90)/180,
            x1=60+r*Math.cos(toR(s)), y1=60+r*Math.sin(toR(s)),
            x2=60+r*Math.cos(toR(e)), y2=60+r*Math.sin(toR(e)),
            la=(e-s)>180?1:0;
      return `M60,60 L${x1},${y1} A${r},${r} 0 ${la} 1 ${x2},${y2} Z`;
    },
    goToAllRecords(){ this.$router.push('/all-records'); },
    getRecordLabel(r){
      let name='未知';
      if(r.official_food_id){
        const of=this.store.officialFoods.find(x=>x.id===r.official_food_id);
        if(of) name=of.name;
      } else if(r.custom_food_id){
        const cf=this.store.customFoods.find(x=>x.id===r.custom_food_id);
        if(cf) name=cf.name;
      } else if(r.manual_name){
        name=r.manual_name;
      }
      return `${name} (${r.calorie_sum.toFixed(0)} kcal)`;
    },
    editRecord(r){ this.$router.push({path:'/add-record',query:{id:r.id}}); },
    async deleteRecord(id){
      if(!confirm('確定要刪除此筆紀錄？')) return;
      try {
        await httpRecord.delete(`/diet-records/${id}`);
        this.store.records = this.store.records.filter(rr=>rr.id!==id);
      } catch { alert('刪除失敗'); }
    },
    showFoodDetails(r){
      let details={ name:'未知', calories:r.calorie_sum, carbs:r.carb_sum, protein:r.protein_sum, fat:r.fat_sum };
      if(r.official_food_id){
        const of=this.store.officialFoods.find(x=>x.id===r.official_food_id);
        if(of) details={ name:of.name, calories:of.calories, carbs:of.carbs, protein:of.protein, fat:of.fat };
      } else if(r.custom_food_id){
        const cf=this.store.customFoods.find(x=>x.id===r.custom_food_id);
        if(cf) details={ name:cf.name, calories:cf.calories, carbs:cf.carbs, protein:cf.protein, fat:cf.fat };
      }
      this.$root.showModal(details);
    }
  },
  async mounted(){ await this.store.fetchAllSharedData(); }
};

// ------------------------------
// 5. Add/Edit Record 元件
// ------------------------------
const AddRecord = {
  template: '#add-record-template',
  inject: ['store'],
  data() {
    return {
      inputMode: 'official',
      form: {
        official_food_id: null,
        custom_food_id:   null,
        manual_name:      '',
        record_time:      '',
        qty:              1,
        calorie_sum:      0,
        carb_sum:         0,
        protein_sum:      0,
        fat_sum:          0
      },
      editing: false,
      editId:  null,
      error:   ''
    };
  },
  computed: {
    officialFoods(){ return this.store.officialFoods; },
    customFoods()  { return this.store.customFoods; }
  },
  methods: {
    initializeForm() {
      this.editId  = this.$route.query.id ? Number(this.$route.query.id) : null;
      this.editing = !!this.editId;

      if (this.editing) {
        const r = this.store.records.find(rec=>rec.id===this.editId);
        if (!r) return;

        this.form.qty         = r.qty;
        this.form.record_time = r.record_time.replace(' ','T').slice(0,16);

        if (r.official_food_id) {
          this.inputMode             = 'official';
          this.form.official_food_id = r.official_food_id;
          const of                   = this.store.officialFoods.find(x=>x.id===r.official_food_id);
          this.form.calorie_sum      = of.calories;
          this.form.carb_sum         = of.carbs;
          this.form.protein_sum      = of.protein;
          this.form.fat_sum          = of.fat;
        }
        else if (r.custom_food_id) {
          this.inputMode             = 'custom';
          this.form.custom_food_id   = r.custom_food_id;
          const cf                   = this.store.customFoods.find(x=>x.id===r.custom_food_id);
          this.form.calorie_sum      = cf.calories;
          this.form.carb_sum         = cf.carbs;
          this.form.protein_sum      = cf.protein;
          this.form.fat_sum          = cf.fat;
        }
        else {
          this.inputMode        = 'manual';
          this.form.manual_name = r.manual_name;
          this.form.calorie_sum = r.calorie_sum / r.qty;
          this.form.carb_sum    = r.carb_sum    / r.qty;
          this.form.protein_sum = r.protein_sum / r.qty;
          this.form.fat_sum     = r.fat_sum     / r.qty;
        }
      }
      else {
        const now=new Date();
        now.setMinutes(now.getMinutes()-now.getTimezoneOffset());
        this.form.record_time = now.toISOString().slice(0,16);
      }
    },
    onOfficialChange() {
      const of = this.officialFoods.find(x=>x.id===this.form.official_food_id);
      if(of){
        this.form.calorie_sum = of.calories;
        this.form.carb_sum    = of.carbs;
        this.form.protein_sum = of.protein;
        this.form.fat_sum     = of.fat;
      }
      this.form.custom_food_id = null;
      this.form.manual_name    = '';
    },
    onCustomChange() {
      const cf = this.customFoods.find(x=>x.id===this.form.custom_food_id);
      if(cf){
        this.form.calorie_sum = cf.calories;
        this.form.carb_sum    = cf.carbs;
        this.form.protein_sum = cf.protein;
        this.form.fat_sum     = cf.fat;
      }
      this.form.official_food_id = null;
      this.form.manual_name      = '';
    },
    async submitRecord() {
      if (!this.form.record_time) {
        this.error = '請選擇時間'; return;
      }
      const dtFormatted = this.form.record_time.replace('T',' ') + ':00';
      const payload = {
        record_time:       dtFormatted,
        qty:               this.form.qty,
        calorie_sum:       this.form.calorie_sum * this.form.qty,
        carb_sum:          this.form.carb_sum    * this.form.qty,
        protein_sum:       this.form.protein_sum * this.form.qty,
        fat_sum:           this.form.fat_sum     * this.form.qty,
        official_food_id:  null,
        custom_food_id:    null,
        manual_name:       null
      };
      if(this.inputMode==='official') payload.official_food_id=this.form.official_food_id;
      else if(this.inputMode==='custom') payload.custom_food_id=this.form.custom_food_id;
      else payload.manual_name=this.form.manual_name;

      if ((this.inputMode==='official'&&!payload.official_food_id) ||
          (this.inputMode==='custom'  &&!payload.custom_food_id)   ||
          (this.inputMode==='manual'  &&!payload.manual_name)     ||
          payload.calorie_sum===null ||
          payload.carb_sum===null    ||
          payload.protein_sum===null ||
          payload.fat_sum===null) {
        this.error='請確保所有必填欄位都已填寫或選擇。';
        return;
      }

      try {
        if (!this.editing) {
          await httpRecord.post('/diet-records', payload);
        } else {
          await httpRecord.put(`/diet-records/${this.editId}`, payload);
        }
        this.store.dataLoaded = false;
        this.$router.replace('/');
      } catch (err) {
        console.error("提交紀錄失敗:", err);
        this.error = this.editing
          ? '更新失敗，請檢查欄位或網路。'
          : '新增失敗，請檢查欄位或網路。';
      }
    }
  },
  async mounted() {
    await this.store.fetchAllSharedData();
    this.initializeForm();
  }
};

// ------------------------------
// 6. All Records（完整列表）組件
// ------------------------------
const AllRecords = {
  template: '#all-records-template',
  inject: ['store'], // 注入 store
  computed: {
    groupedRecords() {
      const groups = {};
      this.store.records.forEach(r => {
        const datePart = r.record_time.split(' ')[0];
        if (!groups[datePart]) {
          groups[datePart] = [];
        }
        groups[datePart].push(r);
      });
      return Object.keys(groups).sort((a, b) => new Date(b) - new Date(a)).reduce((obj, key) => {
        obj[key] = groups[key].sort((a,b) => new Date(b.record_time) - new Date(a.record_time));
        return obj;
      }, {});
    },
    records() {
      return this.store.records;
    }
  },
  methods: {
    formatTime(dtStr) {
      const dt = new Date(dtStr.replace(' ', 'T'));
      const hh = String(dt.getHours()).padStart(2, '0');
      const mi = String(dt.getMinutes()).padStart(2, '0');
      return `${hh}:${mi}`;
    },
    weekdayOf(dateStr) {
      const dt = new Date(dateStr);
      const map = ['日','一','二','三','四','五','六'];
      return `週${map[dt.getDay()]}`;
    },
    getRecordLabel(r) {
      let name = '未知';
      if (r.official_food_id) {
        const of = this.store.officialFoods.find(x => x.id === r.official_food_id);
        if (of) name = of.name;
      } else if (r.custom_food_id) {
        const cf = this.store.customFoods.find(x => x.id === r.custom_food_id);
        if (cf) name = cf.name;
      } else if (r.manual_name) {
        name = r.manual_name;
      }
      return `${name} (${r.calorie_sum.toFixed(0)} kcal)`;
    },
    editRecord(r) {
      this.$router.push({ path: '/add-record', query: { id: r.id } });
    },
    async deleteRecord(id) {
      if (!confirm('確定要刪除此筆紀錄？')) return;
      try {
        await httpRecord.delete(`/diet-records/${id}`);
        this.store.records = this.store.records.filter(r => r.id !== id);
      } catch {
        alert('刪除失敗');
      }
    },
    showFoodDetails(r) {
      let details = {
        name: '未知',
        calories: r.calorie_sum,
        carbs: r.carb_sum,
        protein: r.protein_sum,
        fat: r.fat_sum,
      };

      if (r.official_food_id) {
        const of = this.store.officialFoods.find(x => x.id === r.official_food_id);
        if (of) {
            details.name = of.name;
            details.calories = of.calories;
            details.carbs = of.carbs;
            details.protein = of.protein;
            details.fat = of.fat;
        }
      } else if (r.custom_food_id) {
        const cf = this.store.customFoods.find(x => x.id === r.custom_food_id);
        if (cf) {
            details.name = cf.name;
            details.calories = cf.calories;
            details.carbs = cf.carbs;
            details.protein = cf.protein;
            details.fat = cf.fat;
        }
      } else if (r.manual_name) {
        details.name = r.manual_name;
      }
      
      this.$root.showModal(details);
    }
  },
  async mounted() {
    await this.store.fetchAllSharedData();
  }
};


// ------------------------------
// 7. Custom Foods（自訂食物）組件
// ------------------------------
const CustomFoods = {
  template: '#custom-foods-template',
  inject: ['store'],
  computed: {
    foods() {
      return this.store.customFoods;
    }
  },
  methods: {
    getFoodLabel(f) {
      return `${f.name} (${f.calories.toFixed(0)} kcal)`;
    },
    goToAddFood() { this.$router.push('/add-food'); },
    editFood(f) { this.$router.push({ path: '/add-food', query: { id: f.id } }); },
    async deleteFood(id) {
      if (!confirm('確定要刪除此筆自訂食物？')) return;
      try {
        await httpFood.delete(`/customer-foods/${id}`);
        this.store.customFoods = this.store.customFoods.filter(f => f.id !== id);
      } catch {
        alert('刪除失敗');
      }
    }
  },
  async mounted() {
    await this.store.fetchAllSharedData();
  }
};


// ------------------------------
// 8. Add/Edit Food（新增或編輯自訂食物）組件
// ------------------------------
const AddFood = {
  template: '#add-food-template',
  inject: ['store'],
  data() {
    return {
      form: {
        name: '', calories: null, protein: null, fat: null, carbs: null
      },
      editing: false,
      editId: null,
      error: '',
    };
  },
  methods: {
    initializeForm() {
        this.editId = this.$route.query.id ? Number(this.$route.query.id) : null;
        this.editing = !!this.editId;

        if (this.editing) {
            const f = this.store.customFoods.find(food => food.id === this.editId);
            if (f) {
                this.form = { ...f };
            }
        }
    },
    async submitFood() {
      if (!this.form.name || this.form.calories === null || this.form.protein === null || this.form.fat === null || this.form.carbs === null) {
        this.error = '請確保所有欄位都已填寫。';
        return;
      }
      try {
        const payload = {
          name: this.form.name,
          calories: this.form.calories,
          protein: this.form.protein,
          fat: this.form.fat,
          carbs: this.form.carbs
        };
        
        if (!this.editing) {
          await httpFood.post('/customer-foods', payload);
        } else {
          await httpFood.put(`/customer-foods/${this.editId}`, payload);
        }
        
        this.store.dataLoaded = false;
        this.$router.replace('/custom-foods');
      } catch (err) {
        console.error("提交自訂食物失敗:", err);
        if (err.response && err.response.status === 409) {
          this.error = '食物名稱重複，請換一個。';
        } else {
          this.error = '操作失敗，請檢查欄位或網路。';
        }
      }
    }
  },
  async mounted() {
    await this.store.fetchAllSharedData();
    this.initializeForm();
  }
};


// ------------------------------
// Vue Router & App 啟動
// ------------------------------
const routes = [
  { path:'/login',       component: Login },
  { path:'/signup',      component: Signup },
  { path:'/',            component: Dashboard },
  { path:'/add-record',  component: AddRecord },
  { path:'/all-records', component: AllRecords },
  { path:'/custom-foods',component: CustomFoods },
  { path:'/add-food',    component: AddFood }
];

const router = VueRouter.createRouter({
  history: VueRouter.createWebHashHistory(),
  routes
});

router.beforeEach(async(to,from,next)=>{
  if (['/login','/signup'].includes(to.path)) return next();
  if (!localStorage.getItem('username')) {
    store.logoutCleanup();
    return next('/login');
  }
  if (!store.dataLoaded) {
    await store.fetchAllSharedData();
    if (!store.isLoggedIn) return next('/login');
  }
  next();
});

const app = Vue.createApp({
  data(){ return { sharedState: store, isModalVisible:false, modalFoodDetails:null }; },
  computed: { isLoggedIn(){ return this.sharedState.isLoggedIn; } },
  methods:{
    async doLogout(){
      try { await httpAuth.post('/logout'); }
      catch(e){ console.error("登出失敗:",e); }
      this.sharedState.logoutCleanup();
      this.closeModal();
      router.replace('/login');
    },
    showModal(details){ this.modalFoodDetails=details; this.isModalVisible=true; },
    closeModal(){ this.isModalVisible=false; this.modalFoodDetails=null; }
  },
  provide(){ return { store }; }
});
app.use(router);
app.mount('#app');

