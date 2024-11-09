require('dotenv').config();
const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const {Pool} = require('pg');
const {nanoid} = require('nanoid')

const client = new Client();
const pool = new Pool();

client.on('ready', async () => {
  try {
    console.log('Client WA Ready!');
  } catch (error) {
    console.log(error);
  }
});

client.on('qr', qr => {
    qrcode.generate(qr, {small: true});
});

client.on('message_create', async (msg) => {
  const transaction = await pool.connect()
  //ada validasi jika pengirimnya ada nomor server sendiri
  //pesan dari nomor bot server tidak boleh terbaca/diproses
  try {
    const chatSplit = msg.body.split('\n').map(e => e.toLowerCase());

    const data = {
      old_badge : "",
      new_badge : "",
      fullName: "",
      department: "",
      company: "",
      old_room : "",
      new_room : ""
    };

    for (let i = 0; i < chatSplit.length; i++) {
      if (chatSplit[i].match("badge lama") !== null) {
        data.old_badge = chatSplit[i].split(":")[1].trim();
      }else if (chatSplit[i].match("badge baru") !== null) {
        data.new_badge = chatSplit[i].split(":")[1].trim();
      }else if (chatSplit[i].match("nama") !== null) {
        data.fullName = chatSplit[i].split(":")[1].trim();
      }else if (chatSplit[i].match("dep") !== null) {
        data.department = chatSplit[i].split(":")[1].trim();
      }else if (chatSplit[i].match("peru") !== null) {
        data.company = chatSplit[i].split(":")[1].trim();
      }else if (chatSplit[i].match("kamar lama") !== null) {
        data.old_room = chatSplit[i].split(":")[1].trim();
      }else if (chatSplit[i].match("kamar baru") !== null) {
        data.new_room = chatSplit[i].split(":")[1].trim();
      }
    }

    // PROSES INI HARUS DALAM ANTRIAN/MESSAGE BROKER
    // PROSES INI HARUS DALAM MODE TRANSACTION >> done

    await transaction.query('BEGIN')

    const checkNoHp = 'select * from employee where no_hp = $1 or new_badge = $2';
    const valuesCheckNoHp = [msg.from.split('@')[0], data.new_badge];
    const resultCheckNoHp = await transaction.query(checkNoHp, valuesCheckNoHp)

    // Belum Ada Pengecekkan Badge Telah Terdaftar
    // Belum Ada Pengecekkan Verifikasi Badge

    if (resultCheckNoHp.rows.length > 0) {
      const idEmployee = resultCheckNoHp.rows[0].id
      const clientReadySql =  'select vouchers.login_id, vouchers.password from employee_voucher inner join vouchers on employee_voucher.voucher_id = vouchers.id where employee_voucher.employee_id = $1';
      const clientReadyValue = [idEmployee]
      const clientReadyResult = await transaction.query(clientReadySql, clientReadyValue)
      msg.reply(`Username : ${clientReadyResult.rows[0].login_id}\nPassword : ${clientReadyResult.rows[0].password}`)
      throw {error: 'CLIENT ALREADY EXISTS ', no_hp : valuesCheckNoHp[0]}
    }else{
      const resultCheckVoucher = await transaction.query('select * from vouchers where used = false');
      if (!resultCheckVoucher.rows.length) { // Pengecekkan Ketersedian Voucher WiFi
        throw {error: 'VOUCHER NOT AVAILABLE ', no_hp : valuesCheckNoHp[0]}
      } else {
        // Proses Mencatat Data Karyawan, Voucher Dan Log Vucher Karyawan
        const insertEmployee = 'insert into employee (id, old_badge, new_badge, fullname, department, company, old_barrack_number, new_barrack_number, no_hp) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id';
        const valuesEmployee = [nanoid(8), data.old_badge, data.new_badge, data.fullName, data.department, data.company, data.old_room, data.new_room, valuesCheckNoHp[0]];
        const resultCheckEmployee = await transaction.query(insertEmployee, valuesEmployee);

        // Proses Update Data Voucher
        const updateVoucher = 'update vouchers set used = true where id = $1 returning id';
        const valuesUpdateVoucher = [resultCheckVoucher.rows[0].id]
        const resultUpdateVoucher = await transaction.query(updateVoucher, valuesUpdateVoucher)

        // Proses Mencatat Log Voucher Karyawan
        const insertEmployeeVoucher= 'insert into employee_voucher (id, employee_id, voucher_id) values ($1, $2, $3) returning id';
        const valueEmployeeVoucher = [nanoid(8), resultCheckEmployee.rows[0].id, resultUpdateVoucher.rows[0].id]
        await transaction.query(insertEmployeeVoucher, valueEmployeeVoucher)
        msg.reply(`Username : ${resultCheckVoucher.rows[0].login_id}\nPassword : ${resultCheckVoucher.rows[0].password}`)
        await transaction.query('COMMIT')
      }
    }

  } catch (error) {
    console.log(error);
    await transaction.query('ROLLBACK')
  }finally{
    transaction.release()
  }
  

})

client.initialize();
