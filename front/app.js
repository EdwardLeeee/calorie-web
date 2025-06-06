// app.js

// 後端 API 根網址
const AUTH_BASE = 'http://127.0.0.1:5001';  // Auth 服務
const API_BASE  = 'http://127.0.0.1:1122';  // Customer Foods 服務
const RECORD_BASE = 'http://127.0.0.1:1133';// Diet Record service


// 建立 axios 實例，withCredentials: true 為了帶 Session Cookie
const httpAuth   = axios.create({ baseURL: AUTH_BASE,   withCredentials: true });
const httpFood   = axios.create({ baseURL: API_BASE,    withCredentials: true });
const httpRecord = axios.create({ baseURL: RECORD_BASE, withCredentials: true });

// 建立 axios 實例，自動攜帶 Cookie (Flask Session)
const http = axios.create({
  withCredentials: true
});

// -----------------------
// 1. Login 組件 (只取 template)
// -----------------------
const Login = {
  template: '#login-template',  // 直接引用 <template id="login-template">
  data() {
    return {
      username: '',
      password: '',
      message: ''
    };
  },
  computed: {
    messageClass() {
      // 如果訊息以「已」開頭，就當作 success，否則 error
      return this.message.startsWith('已') ? 'success' : 'error';
    }
  },
  methods: {
    removeReadonly(e) {
      e.target.removeAttribute('readonly');
    },
    async doLogin() {
      if (!this.username || !this.password) {
        this.message = '請輸入使用者名稱與密碼。';
        return;
      }
      try {
        const resp = await http.post(`${AUTH_BASE}/login`, {
          username: this.username,
          password: this.password
        });
        if (resp.data.message === '登入成功') {
          localStorage.setItem('username', this.username);
          this.$router.replace('/');
        }
      } catch (err) {
        this.message = err.response?.data?.error || '登入失敗，請稍後再試。';
      }
    }
  },
  mounted() {
    // 如果有 query.msg (例如註冊成功訊息)，顯示綠字
    const msg = this.$route.query.msg;
    if (msg) {
      this.message = msg;
    }
  }
};

// -----------------------
// 2. Signup 組件 (只取 template)
// -----------------------
const Signup = {
  template: '#signup-template',
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
        this.message = '請輸入使用者名稱與密碼。';
        return;
      }
      try {
        const resp = await http.post(`${AUTH_BASE}/signup`, {
          username: this.username,
          password: this.password
        });
        if (resp.status === 201) {
          // 註冊成功後跳回登入頁，並帶 msg
          this.$router.replace({ path: '/login', query: { msg: '已註冊，請重新登入。' } });
        }
      } catch (err) {
        this.message = err.response?.data?.error || '註冊失敗，請稍後再試。';
      }
    }
  }
};

// -----------------------
// 3. Home 組件 (只取 template)
// -----------------------
const Home = {
  template: '#home-template',
  data() {
    return {
      sessionUser: '',
      foods: [],
      form: {
        name: '',
        calories: 0,
        protein: 0,
        fat: 0,
        carbs: 0
      },
      editing: false,
      editId: null,
      error: ''
    };
  },
  methods: {
    async fetchFoods() {
      try {
        const resp = await http.get(`${API_BASE}/customer-foods`, {
          params: { user_id: this.sessionUser }
        });
        this.foods = resp.data;
      } catch {
        this.error = '取得資料失敗，請確認是否已登入。';
        this.$router.replace('/login');
      }
    },
    async doLogout() {
      try {
        await http.post(`${AUTH_BASE}/logout`);
      } catch (e) {
        console.warn('Logout error:', e);
      }
      localStorage.removeItem('username');
      this.$router.replace('/login');
    },
    startEdit(food) {
      this.editing = true;
      this.editId = food.id;
      this.form = {
        name: food.name,
        calories: food.calories,
        protein: food.protein,
        fat: food.fat,
        carbs: food.carbs
      };
    },
    cancelEdit() {
      this.editing = false;
      this.editId = null;
      this.form = { name: '', calories: 0, protein: 0, fat: 0, carbs: 0 };
    },
    async deleteFood(id) {
      if (!confirm('確定要刪除？')) return;
      try {
        await http.delete(`${API_BASE}/customer-foods/${id}`);
        this.fetchFoods();
      } catch {
        this.error = '刪除失敗，請稍後再試。';
      }
    },
    async submitForm() {
      if (!this.editing) {
        // 新增
        try {
          await http.post(`${API_BASE}/customer-foods`, {
            user_id: this.sessionUser,
            name: this.form.name,
            calories: this.form.calories,
            protein: this.form.protein,
            fat: this.form.fat,
            carbs: this.form.carbs
          });
          this.fetchFoods();
          this.form = { name: '', calories: 0, protein: 0, fat: 0, carbs: 0 };
        } catch {
          this.error = '新增失敗，請稍後再試。';
        }
      } else {
        // 更新
        try {
          await http.put(`${API_BASE}/customer-foods/${this.editId}`, {
            name: this.form.name,
            calories: this.form.calories,
            protein: this.form.protein,
            fat: this.form.fat,
            carbs: this.form.carbs
          });
          this.fetchFoods();
          this.cancelEdit();
        } catch {
          this.error = '更新失敗，請稍後再試。';
        }
      }
    }
  },
  async beforeRouteEnter(to, from, next) {
    try {
      const resp = await http.get(`${AUTH_BASE}/whoami`);
      if (resp.data.logged_in) {
        next(vm => {
          vm.sessionUser = resp.data.username;
          vm.fetchFoods();
        });
      } else {
        next('/login');
      }
    } catch {
      next('/login');
    }
  }
};

// ----------------------
// 4. DietRecords 組件
// ----------------------
const DietRecords = {
  template: '#records-template',
  data() {
    return {
      sessionUserId:    null,
      sessionUsername:  '',
      records:          [],
      officialFoods:    [],
      customFoods:      [],
      inputMode:        'official',   // 默認使用官方食物
      form: {
        official_food_id: null,
        custom_food_id:   null,
        manual_name:      '',
        record_time:      '',    // YYYY-MM-DDTHH:MM
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
  methods: {
    // 1) 取得官方列表、自訂列表，以及使用者所有紀錄
    async fetchData() {
      try {
        // 先拿 whoami 確認身份
        const who = await httpAuth.get('/whoami');
        if (!who.data.logged_in) {
          this.$router.replace('/login');
          return;
        }
        this.sessionUserId   = who.data.user_id;
        this.sessionUsername = who.data.username;

        // 拿官方食物
        const ofResp = await httpRecord.get('/official-foods');
        this.officialFoods = ofResp.data;

        // 拿自訂食物 (同 API_BASE 端)
        const cfResp = await httpFood.get('/customer-foods', {
          params: { user_id: this.sessionUserId }
        });
        this.customFoods = cfResp.data;

        // 拿飲食紀錄
        const recResp = await httpRecord.get('/diet-records');
        this.records = recResp.data;
      } catch (err) {
        this.error = '資料讀取失敗，請重新登入。';
        this.$router.replace('/login');
      }
    },
    // 格式化時間戳： "2025-06-06 14:22:00" → "2025-06-06 14:22"
    formatDateTime(dtStr) {
      const dt = new Date(dtStr.replace(' ', 'T'));
      const yyyy = dt.getFullYear();
      const mm = String(dt.getMonth()+1).padStart(2, '0');
      const dd = String(dt.getDate()).padStart(2, '0');
      const hh = String(dt.getHours()).padStart(2, '0');
      const mi = String(dt.getMinutes()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    },
    doLogout() {
      httpAuth.post('/logout').catch(()=>{});
      localStorage.removeItem('userId');
      localStorage.removeItem('username');
      this.$router.replace('/login');
    },
    // 當選擇「官方食物」的下拉改變時，把該筆數值填入 form
    onOfficialChange() {
      const of = this.officialFoods.find(x => x.id === this.form.official_food_id);
      if (of) {
        this.form.calorie_sum = of.calories;
        this.form.carb_sum    = of.carbs;
        this.form.protein_sum = of.protein;
        this.form.fat_sum     = of.fat;
      }
      // 清除 custom_food_id、manual_name
      this.form.custom_food_id = null;
      this.form.manual_name = '';
    },
    // 當選擇「自訂食物」的下拉改變時，把數值填入 form
    onCustomChange() {
      const cf = this.customFoods.find(x => x.id === this.form.custom_food_id);
      if (cf) {
        this.form.calorie_sum = cf.calories;
        this.form.carb_sum    = cf.carbs;
        this.form.protein_sum = cf.protein;
        this.form.fat_sum     = cf.fat;
      }
      // 清除 official_food_id、manual_name
      this.form.official_food_id = null;
      this.form.manual_name = '';
    },
    // 刪除紀錄
    async deleteRecord(id) {
      if (!confirm('確定要刪除這筆飲食紀錄？')) return;
      try {
        await httpRecord.delete(`/diet-records/${id}`);
        this.fetchData();
      } catch {
        this.error = '刪除失敗，請稍後再試。';
      }
    },
    // 取消編輯
    cancelEdit() {
      this.editing = false;
      this.editId = null;
      this.resetForm();
    },
    // 重設 form
    resetForm() {
      this.inputMode = 'official';
      this.form = {
        official_food_id: null,
        custom_food_id:   null,
        manual_name:      '',
        record_time:      '',
        calorie_sum:      0,
        carb_sum:         0,
        protein_sum:      0,
        fat_sum:          0
      };
    },
    // 新增／更新
    async submitForm() {
      // 檢查 record_time
      if (!this.form.record_time) {
        this.error = '請選擇時間';
        return;
      }
      // 轉成後端要的格式 "YYYY-MM-DD HH:MM:SS"
      const dtFormatted = this.form.record_time.replace('T', ' ') + ':00';

      const payload = {
        record_time: dtFormatted,
        calorie_sum: this.form.calorie_sum,
        carb_sum:    this.form.carb_sum,
        protein_sum: this.form.protein_sum,
        fat_sum:     this.form.fat_sum
      };
      if (this.inputMode === 'official') {
        payload.official_food_id = this.form.official_food_id;
      } else if (this.inputMode === 'custom') {
        payload.custom_food_id = this.form.custom_food_id;
      } else if (this.inputMode === 'manual') {
        // 手動輸入不帶 food_id、僅保留 manual_name 可作為 UI 顯示用
        payload.official_food_id = null;
        payload.custom_food_id   = null;
        payload.manual_name      = this.form.manual_name;
      }

      try {
        if (!this.editing) {
          // 新增
          await httpRecord.post('/diet-records', payload);
        } else {
          // 更新
          await httpRecord.put(`/diet-records/${this.editId}`, payload);
        }
        this.fetchData();
        this.cancelEdit();
      } catch {
        this.error = this.editing ? '更新失敗，請稍後再試。' : '新增失敗，請稍後再試。';
      }
    },
    // 開始編輯 (先把資料塞進 form)
    startEdit(rec) {
      this.editing = true;
      this.editId = rec.id;
      // 判斷 rec 來源：
      if (rec.official_food_id) {
        this.inputMode = 'official';
        this.form.official_food_id = rec.official_food_id;
        const of = this.officialFoods.find(x => x.id === rec.official_food_id);
        if (of) {
          this.form.calorie_sum = of.calories;
          this.form.carb_sum    = of.carbs;
          this.form.protein_sum = of.protein;
          this.form.fat_sum     = of.fat;
        }
      } else if (rec.custom_food_id) {
        this.inputMode = 'custom';
        this.form.custom_food_id = rec.custom_food_id;
        const cf = this.customFoods.find(x => x.id === rec.custom_food_id);
        if (cf) {
          this.form.calorie_sum = cf.calories;
          this.form.carb_sum    = cf.carbs;
          this.form.protein_sum = cf.protein;
          this.form.fat_sum     = cf.fat;
        }
      } else {
        this.inputMode = 'manual';
        this.form.manual_name   = rec.manual_name || '';
        this.form.calorie_sum   = rec.calorie_sum;
        this.form.carb_sum      = rec.carb_sum;
        this.form.protein_sum   = rec.protein_sum;
        this.form.fat_sum       = rec.fat_sum;
      }
      // 轉回 `datetime-local` 格式
      this.form.record_time = rec.record_time.replace(' ', 'T').slice(0,16);
    }
  },
  async beforeRouteEnter(to, from, next) {
    try {
      const resp = await httpAuth.get('/whoami');
      if (resp.data.logged_in) {
        next(vm => { vm.fetchData(); });
      } else {
        next('/login');
      }
    } catch {
      next('/login');
    }
  }
};

// ----------------------
// Vue Router 設定
// ----------------------
const routes = [
  { path: '/login',   component: Login },
  { path: '/signup',  component: Signup },
  { path: '/',        component: Home },
  { path: '/records', component: DietRecords }
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
    return next('/login');
  }
  next();
});


// -----------------------
//  建立 Vue App 並掛載
// -----------------------
const app = Vue.createApp({
  template: '<router-view></router-view>'
});
app.use(router);
app.mount('#app');

