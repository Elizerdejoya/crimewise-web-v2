const API_BASE_URL = 'https://crimewise-web-v2-ri4n.vercel.app';

// Test credentials
const ADMIN_EMAIL = 'admin@crimewise.com';
const ADMIN_PASSWORD = 'adminpass';

let authToken = '';
let exam = null;

async function login() {
  console.log('🔐 Logging in as admin...');
  const res = await fetch(`${API_BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    })
  });
  
  if (!res.ok) {
    throw new Error(`Login failed: ${res.status}`);
  }
  
  const data = await res.json();
  authToken = data.token;
  console.log('✅ Admin login successful');
  return data;
}

async function getExam() {
  console.log('📋 Fetching exam...');
  const res = await fetch(`${API_BASE_URL}/api/exams`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  
  if (!res.ok) {
    throw new Error(`Fetch exams failed: ${res.status}`);
  }
  
  const exams = await res.json();
  exam = exams[exams.length - 1]; // Get latest exam
  console.log(`✅ Using exam: ${exam.name} (ID: ${exam.id}, Token: ${exam.token})`);
  return exam;
}

async function submitExam(studentIndex, studentId, examToken) {
  try {
    // Get exam by token
    const examRes = await fetch(`${API_BASE_URL}/api/exams/token/${examToken}`, {
      headers: { 'Authorization': `Bearer ${studentId}` }
    });

    if (!examRes.ok) {
      return { success: false, error: `Failed to get exam: ${examRes.status}` };
    }

    const examData = await examRes.json();

    // Submit answer
    const submitRes = await fetch(`${API_BASE_URL}/api/results`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentId}`
      },
      body: JSON.stringify({
        exam_id: examData.id,
        student_id: studentId,
        table: {
          victim: 'John Doe',
          date: '2025-12-06',
          time: '10:00 AM',
          location: 'Downtown',
          cause: 'Natural'
        },
        findings: ['Finding 1', 'Finding 2', 'Finding 3']
      })
    });

    if (!submitRes.ok) {
      return { 
        success: false, 
        error: `Submit failed: ${submitRes.status}`,
        studentIndex
      };
    }

    const result = await submitRes.json();
    return { 
      success: true, 
      resultId: result.id,
      studentIndex
    };
  } catch (err) {
    return { 
      success: false, 
      error: err.message,
      studentIndex
    };
  }
}

async function getAIGrade(resultId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/ai-grades/${resultId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (res.status === 404) {
      return { status: 'pending' };
    }

    if (!res.ok) {
      return { status: 'error', error: res.status };
    }

    const data = await res.json();
    return { status: 'completed', ...data };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

async function testWithStudents(studentIdList) {
  console.log(`\n🚀 Starting 250 concurrent exam submissions...`);
  
  const startTime = Date.now();
  
  // Submit all exams concurrently
  const submitPromises = studentIdList.map((studentId, idx) => 
    submitExam(idx, studentId, exam.token)
  );
  
  const submissions = await Promise.all(submitPromises);
  
  const successCount = submissions.filter(s => s.success).length;
  console.log(`\n✅ Submissions completed: ${successCount}/250 successful`);
  
  if (successCount === 0) {
    console.log('❌ No successful submissions');
    return;
  }

  // Wait a bit for AI grading to process
  console.log('\n⏳ Waiting 30 seconds for AI grading to process...');
  await new Promise(resolve => setTimeout(resolve, 30000));

  // Check AI grades
  console.log('\n🔍 Checking AI grades...');
  const resultIds = submissions
    .filter(s => s.success)
    .map(s => s.resultId);

  const gradePromises = resultIds.map(id => getAIGrade(id));
  const grades = await Promise.all(gradePromises);

  const completedGrades = grades.filter(g => g.status === 'completed').length;
  const pendingGrades = grades.filter(g => g.status === 'pending').length;
  const errorGrades = grades.filter(g => g.status === 'error').length;

  console.log(`\n📊 AI Grade Status:`);
  console.log(`   ✅ Completed: ${completedGrades}`);
  console.log(`   ⏳ Pending: ${pendingGrades}`);
  console.log(`   ❌ Error: ${errorGrades}`);

  const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n⏱️  Total time: ${elapsedSeconds} seconds`);
  console.log(`🎯 Throughput: ${(successCount / (elapsedSeconds / 60)).toFixed(2)} submissions/min`);

  if (completedGrades === successCount) {
    console.log('\n🎉 SUCCESS! All 250 submissions have AI grades!');
  } else {
    console.log(`\n⚠️  ${pendingGrades} submissions still pending AI grades`);
    console.log('   These should complete in the background');
  }
}

async function main() {
  try {
    // Login
    await login();

    // Get exam
    await getExam();

    // Create test student IDs (2 to 251 for 250 students)
    const studentIds = [];
    for (let i = 2; i <= 251; i++) {
      studentIds.push(i);
    }

    // Run test
    await testWithStudents(studentIds);

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main().then(() => {
  console.log('\n✨ Test complete');
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
