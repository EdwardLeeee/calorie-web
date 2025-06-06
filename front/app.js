// app.js

// 先宣告後端三個服務的 base URL
const AUTH_BASE   = 'http://127.0.0.1:5001';
const API_BASE    = 'http://127.0.0.1:1122';
const RECORD_BASE = 'http://127.0.0.1:1133';

// 建立 axios 實例，自動攜帶 Cookie（Session）
const httpAuth   = axios.create({ baseURL: AUTH_BASE,   withCredentials: true });
const httpFood   = axios.create({ baseURL: API_BASE,    withCredentials: true });
const httpRecord = axios.create({ baseURL: RECORD_BASE, withCredentials: true });


// ------------------------------
// [新增] 1. 簡易中央狀態管理器 (Store)
// ------------------------------
const store = Vue.reactive({
  isLoggedIn: !!localStorage.getItem('username'),
  records: [],
  officialFoods: [],
  customFoods: [],
  dataLoaded: false, // Flag to check if data has been fetched

  // 統一的資料載入方法
  async fetchAllSharedData() {
    // 如果未登入或已載入過，就不再執行
    if (!this.isLoggedIn || this.dataLoaded) return;
    
    try {
      const uid = localStorage.getItem('userId');
      const [ofResp, cfResp, recResp] = await Promise.all([
        httpRecord.get('/official-foods'),
        httpFood.get('/customer-foods', { params: { user_id: uid } }),
        httpRecord.get('/diet-records')
      ]);
      this.officialFoods = ofResp.data;
      this.customFoods = cfResp.data;
      this.records = recResp.data.sort((a, b) => new Date(b.record_time) - new Date(a.record_time));
      this.dataLoaded = true; // 標記為已載入
    } catch (e) {
      console.error("Failed to fetch shared data:", e);
      // 可以在這裡觸發登出
      this.logoutCleanup();
    }
  },

  // 登入
  setLoginStatus(status) {
    this.isLoggedIn = status;
    if (!status) {
      this.logoutCleanup();
    }
  },

  // 登出時的清理工作
  logoutCleanup() {
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    this.isLoggedIn = false;
    this.records = [];
    this.officialFoods = [];
    this.customFoods = [];
    this.dataLoaded = false;
  }
});


// ------------------------------
// 2. Login 組件
// ------------------------------
const Login = {
  template: '#login-template',
  inject: ['store'], // [修正] 注入 store
  data() {
    return {
      username: '',
      password: '',
      message: ''
    };
  },
  methods: {
    removeReadonly(e) {
      e.target.removeAttribute('readonly');
    },
    async doLogin() {
      if (!this.username || !this.password) {
        this.message = '請輸入帳號與密碼。';
        return;
      }
      try {
        const resp = await httpAuth.post('/login', {
          username: this.username,
          password: this.password
        });
        if (resp.data.message === '登入成功') {
          const who = await httpAuth.get('/whoami');
          if (who.data.logged_in) {
            localStorage.setItem('userId', who.data.user_id);
            localStorage.setItem('username', who.data.username);
            this.store.setLoginStatus(true); // [修正] 更新 store 狀態
            this.$router.replace('/');
            return;
          }
        }
        this.message = '登入失敗';
      } catch (err) {
        this.message = err.response?.data?.error || '網路錯誤，請稍後再試。';
      }
    }
  }
};


// ------------------------------
// 3. Signup 組件
// ------------------------------
const Signup = {
  template: '#signup-template',
  // 此元件不需共享狀態，維持原樣
  data() {
    return {
      username: '',
      password: '',
      message: ''
    };
  },
  methods: {
    removeReadonly(e) {
      e.target.removeAttribute('readonly');
    },
    async doSignup() {
      if (!this.username || !this.password) {
        this.message = '請輸入帳號與密碼。';
        return;
      }
      try {
        const resp = await httpAuth.post('/signup', {
          username: this.username,
          password: this.password
        });
        if (resp.status === 201) {
          this.$router.replace({ path: '/login', query: { msg: '已註冊，請重新登入。' } });
          return;
        }
      } catch (err) {
        if (err.response && err.response.status === 409) {
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
// 4. Dashboard（首頁）組件
// ------------------------------
const Dashboard = {
  template: '#dashboard-template',
  inject: ['store'], // [修正] 注入 store
  data() {
    return {
      today: new Date(),
      weekdays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
      targetKcal: 2000,
      error: ''
    };
  },
  computed: {
    // [修正] 以下所有計算屬性都從 store 獲取資料
    todayFormatted() {
      const yyyy = this.today.getFullYear();
      const mm = String(this.today.getMonth() + 1).padStart(2, '0');
      const dd = String(this.today.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    },
    todayRecords() {
      return this.store.records.filter(r => r.record_time.startsWith(this.todayFormatted));
    },
    todayCalories() {
      return this.todayRecords.reduce((sum, r) => sum + r.calorie_sum, 0);
    },
    todayCarbs() {
      return this.todayRecords.reduce((sum, r) => sum + r.carb_sum, 0);
    },
    todayProtein() {
      return this.todayRecords.reduce((sum, r) => sum + r.protein_sum, 0);
    },
    todayFat() {
      return this.todayRecords.reduce((sum, r) => sum + r.fat_sum, 0);
    },
    kcalRatio() {
      if (this.targetKcal === 0) return 0;
      return Math.min(this.todayCalories / this.targetKcal, 1);
    },
    circleColor() {
      return (this.todayCalories > this.targetKcal) ? '#ef5350' : '#4caf50';
    },
    totalMacro() {
      return this.todayCarbs + this.todayProtein + this.todayFat;
    },
    macroAngles() {
        if (this.totalMacro <= 0) return { carbs: 0, protein: 0, fat: 0 };
        const pCarbs = (this.todayCarbs / this.totalMacro) * 360;
        const pProtein = (this.todayProtein / this.totalMacro) * 360;
        return { carbs: pCarbs, protein: pProtein, fat: 360 - pCarbs - pProtein };
    },
    macroPercents() {
        if (this.totalMacro <= 0) return { carbs: 0, protein: 0, fat: 0 };
        return {
            carbs: Math.round((this.todayCarbs / this.totalMacro) * 100),
            protein: Math.round((this.todayProtein / this.totalMacro) * 100),
            fat: 100 - Math.round((this.todayCarbs / this.totalMacro) * 100) - Math.round((this.todayProtein / this.totalMacro) * 100)
        };
    },
    todayIndex() {
      let dow = this.today.getDay(); // 0 = Sunday
      return (dow === 0) ? 6 : (dow - 1);
    },
    circumference() {
      return 2 * Math.PI * 54;
    }
  },
  methods: {
    formatTime(dtStr) {
      const dt = new Date(dtStr.replace(' ', 'T'));
      const hh = String(dt.getHours()).padStart(2, '0');
      const mi = String(dt.getMinutes()).padStart(2, '0');
      return `${hh}:${mi}`;
    },
    pieSlicePath(startAngle, endAngle, radius) {
      const convert = (deg) => (Math.PI * (deg - 90) / 180); // Offset by -90 to start from top
      const x1 = 60 + radius * Math.cos(convert(startAngle));
      const y1 = 60 + radius * Math.sin(convert(startAngle));
      const x2 = 60 + radius * Math.cos(convert(endAngle));
      const y2 = 60 + radius * Math.sin(convert(endAngle));
      const largeArc = (endAngle - startAngle) > 180 ? 1 : 0;
      return `M60,60 L${x1},${y1} A${radius},${radius} 0 ${largeArc} 1 ${x2},${y2} Z`;
    },
    goToAllRecords() { this.$router.push('/all-records'); },
    goToCustomFoods() { this.$router.push('/custom-foods'); },
    goToAddRecord() { this.$router.push('/add-record'); },
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
      return `${name}：${r.calorie_sum.toFixed(0)} kcal`;
    },
    editRecord(r) {
      this.$router.push({ path: '/add-record', query: { id: r.id } });
    },
    async deleteRecord(id) {
      if (!confirm('確定要刪除此筆紀錄？')) return;
      try {
        await httpRecord.delete(`/diet-records/${id}`);
        // [修正] 直接更新 store
        this.store.records = this.store.records.filter(r => r.id !== id);
      } catch {
        alert('刪除失敗');
      }
    }
  },
  async mounted() {
    // [修正] 讓 store 統一載入資料
    await this.store.fetchAllSharedData();
  }
};


// ------------------------------
// 5. Add/Edit Record（新增或編輯飲食紀錄）組件
// ------------------------------
const AddRecord = {
  template: '#add-record-template',
  inject: ['store'], // [修正] 注入 store
  data() {
    return {
      inputMode: 'official',
      form: {
        official_food_id: null,
        custom_food_id: null,
        manual_name: '',
        record_time: '',
        calorie_sum: 0,
        carb_sum: 0,
        protein_sum: 0,
        fat_sum: 0
      },
      editing: false,
      editId: null,
      error: ''
    };
  },
  computed: {
    // [修正] 從 store 獲取資料
    officialFoods() { return this.store.officialFoods; },
    customFoods() { return this.store.customFoods; }
  },
  methods: {
    initializeForm() {
        this.editId = this.$route.query.id ? Number(this.$route.query.id) : null;
        this.editing = !!this.editId;

        if (this.editing) {
            // [修正] 直接從 store 找紀錄，不再用 this.$root
            const r = this.store.records.find(rec => rec.id === this.editId);
            if (r) {
                if (r.official_food_id) {
                    this.inputMode = 'official';
                    this.form.official_food_id = r.official_food_id;
                } else if (r.custom_food_id) {
                    this.inputMode = 'custom';
                    this.form.custom_food_id = r.custom_food_id;
                } else {
                    this.inputMode = 'manual';
                    this.form.manual_name = r.manual_name;
                }
                this.form.calorie_sum = r.calorie_sum;
                this.form.carb_sum = r.carb_sum;
                this.form.protein_sum = r.protein_sum;
                this.form.fat_sum = r.fat_sum;
                this.form.record_time = r.record_time.replace(' ', 'T').slice(0, 16);
            }
        } else {
            // 新增模式，設定預設時間
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            this.form.record_time = now.toISOString().slice(0, 16);
        }
    },
    onOfficialChange() {
      const of = this.officialFoods.find(x => x.id === this.form.official_food_id);
      if (of) {
        this.form.calorie_sum = of.calories;
        this.form.carb_sum = of.carbs;
        this.form.protein_sum = of.protein;
        this.form.fat_sum = of.fat;
      }
      this.form.custom_food_id = null;
      this.form.manual_name = '';
    },
    onCustomChange() {
      const cf = this.customFoods.find(x => x.id === this.form.custom_food_id);
      if (cf) {
        this.form.calorie_sum = cf.calories;
        this.form.carb_sum = cf.carbs;
        this.form.protein_sum = cf.protein;
        this.form.fat_sum = cf.fat;
      }
      this.form.official_food_id = null;
      this.form.manual_name = '';
    },
    async submitRecord() {
      // ... (省略未變更的 submitRecord 邏輯)
      if (!this.form.record_time) {
        this.error = '請選擇時間';
        return;
      }
      const dtFormatted = this.form.record_time.replace('T', ' ') + ':00';
      const payload = {
        record_time: dtFormatted,
        calorie_sum: this.form.calorie_sum,
        carb_sum:    this.form.carb_sum,
        protein_sum: this.form.protein_sum,
        fat_sum:     this.form.fat_sum,
        official_food_id: null,
        custom_food_id: null,
        manual_name: null
      };
      if (this.inputMode === 'official') {
        payload.official_food_id = this.form.official_food_id;
      } else if (this.inputMode === 'custom') {
        payload.custom_food_id = this.form.custom_food_id;
      } else if (this.inputMode === 'manual') {
        payload.manual_name = this.form.manual_name;
      }
      try {
        if (!this.editing) {
          await httpRecord.post('/diet-records', payload);
        } else {
          await httpRecord.put(`/diet-records/${this.editId}`, payload);
        }
        this.store.dataLoaded = false; // [修正] 讓下次回到首頁時強制刷新
        this.$router.replace('/');
      } catch {
        this.error = this.editing ? '更新失敗' : '新增失敗';
      }
    }
  },
  async mounted() {
    // [修正] 確保 store 資料已載入，再初始化表單
    await this.store.fetchAllSharedData();
    this.initializeForm();
  }
};


// ------------------------------
// 6. All Records（完整列表）組件
// ------------------------------
const AllRecords = {
  template: '#all-records-template',
  inject: ['store'], // [修正] 注入 store
  computed: {
    // [修正] 直接從 store 計算分組後的紀錄
    groupedRecords() {
      const groups = {};
      this.store.records.forEach(r => {
        const datePart = r.record_time.split(' ')[0];
        if (!groups[datePart]) {
          groups[datePart] = [];
        }
        groups[datePart].push(r);
      });
      return groups;
    },
    // [修正] 確保有紀錄可以顯示
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
      return `${name}：${r.calorie_sum.toFixed(0)} kcal`;
    },
    editRecord(r) {
      this.$router.push({ path: '/add-record', query: { id: r.id } });
    },
    async deleteRecord(id) {
      if (!confirm('確定要刪除此筆紀錄？')) return;
      try {
        await httpRecord.delete(`/diet-records/${id}`);
        // [修正] 直接更新 store
        this.store.records = this.store.records.filter(r => r.id !== id);
      } catch {
        alert('刪除失敗');
      }
    }
  },
  async mounted() {
    // [修正] 確保 store 資料已載入
    await this.store.fetchAllSharedData();
  }
};


// ------------------------------
// 7. Custom Foods（自訂食物）組件
// ------------------------------
const CustomFoods = {
  template: '#custom-foods-template',
  inject: ['store'], // [修正] 注入 store
  computed: {
    // [修正] 從 store 獲取資料
    foods() {
      return this.store.customFoods;
    }
  },
  methods: {
    getFoodLabel(f) {
      return `${f.name}：${f.calories} kcal`;
    },
    goToAddFood() { this.$router.push('/add-food'); },
    editFood(f) { this.$router.push({ path: '/add-food', query: { id: f.id } }); },
    async deleteFood(id) {
      if (!confirm('確定要刪除此筆自訂食物？')) return;
      try {
        await httpFood.delete(`/customer-foods/${id}`);
        // [修正] 直接更新 store
        this.store.customFoods = this.store.customFoods.filter(f => f.id !== id);
      } catch {
        alert('刪除失敗');
      }
    }
  },
  async mounted() {
    // [修正] 確保 store 資料已載入
    await this.store.fetchAllSharedData();
  }
};


// ------------------------------
// 8. Add/Edit Food（新增或編輯自訂食物）組件
// ------------------------------
const AddFood = {
  template: '#add-food-template',
  inject: ['store'], // [修正] 注入 store
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
            // [修正] 從 store 獲取資料
            const f = this.store.customFoods.find(food => food.id === this.editId);
            if (f) {
                this.form = { ...f }; // 複製一份來編輯
            }
        }
    },
    async submitFood() {
      // ... (省略未變更的 submitFood 邏輯)
      if (!this.form.name) {
        this.error = '請輸入食物名稱';
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
        
        // [修正] 新增時不再傳 user_id，由後端 session 判斷
        if (!this.editing) {
          await httpFood.post('/customer-foods', payload);
        } else {
          await httpFood.put(`/customer-foods/${this.editId}`, payload);
        }
        
        this.store.dataLoaded = false; // [修正] 讓下次回到列表時強制刷新
        this.$router.replace('/custom-foods');
      } catch (err) {
        this.error = '操作失敗，請檢查欄位或名稱是否重複。';
      }
    }
  },
  async mounted() {
    // [修正] 確保 store 資料已載入
    await this.store.fetchAllSharedData();
    this.initializeForm();
  }
};


// ------------------------------
// 9. Vue Router 設定
// ------------------------------
const routes = [
  { path: '/login',        component: Login },
  { path: '/signup',       component: Signup },
  { path: '/',             component: Dashboard },
  { path: '/add-record',   component: AddRecord },
  { path: '/all-records',  component: AllRecords },
  { path: '/custom-foods', component: CustomFoods },
  { path: '/add-food',     component: AddFood }
];

const router = VueRouter.createRouter({
  history: VueRouter.createWebHashHistory(),
  routes
});

router.beforeEach((to, from, next) => {
  if (to.path === '/login' || to.path === '/signup') {
    return next();
  }
  if (!localStorage.getItem('username')) {
    store.logoutCleanup(); // [修正] 確保登出時清理 store
    return next('/login');
  }
  next();
});


// ------------------------------
// 10. 建立 Vue App 並掛載
// ------------------------------
const app = Vue.createApp({
  // [修正] 將 store 的狀態提供給根元件模板 (header)
  data() {
    return {
      sharedState: store
    }
  },
  computed: {
    isLoggedIn() {
      return this.sharedState.isLoggedIn;
    }
  },
  methods: {
    // [修正] 登出方法，現在由根元件處理
    async doLogout() {
      try {
        await httpAuth.post('/logout');
      } catch(e) { /* 忽略錯誤 */ }
      
      this.sharedState.logoutCleanup(); // 清理 store
      router.replace('/login'); // 使用 router 實例跳轉
    }
  },
  // [修正] 將 store 提供給所有子元件
  provide() {
    return {
      store
    }
  }
});
app.use(router);
app.mount('#app');
